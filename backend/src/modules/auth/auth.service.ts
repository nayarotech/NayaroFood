import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import {
  OnboardingStep,
  RestaurantRole,
  RestaurantStatus,
  StaffPermission,
  UserRole,
  UserStatus,
  normalisePhone,
  type CompleteSignupInput,
  type RegisterRestaurantInput,
} from '@nayaro/shared';
import { db, type Executor } from '../../db/client.js';
import {
  customers,
  refreshTokens,
  restaurantSettings,
  restaurantUsers,
  restaurants,
  users,
} from '../../db/schema/index.js';
import { fakeVerify, hashPassword, verifyPassword } from '../../lib/password.js';
import {
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
} from '../../lib/tokens.js';
import { uniqueSlug } from '../../lib/slug.js';
import { badRequest, conflict, forbidden, unauthorized } from '../../http/errors.js';
import { consumeCode, issueCode } from './email-codes.service.js';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ensureRankingRow } from '../ranking/ranking.service.js';
import type { AuthContext } from './auth.types.js';

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
  restaurantId: number | null;
}

export interface PublicUser {
  id: number;
  email: string | null;
  name: string;
  phone: string | null;
  role: UserRole;
}

interface RequestMeta {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

/** Never leaks the password hash or token version. */
function toPublicUser(row: {
  id: number;
  email: string | null;
  name: string;
  phone: string | null;
  role: UserRole;
}): PublicUser {
  return { id: row.id, email: row.email, name: row.name, phone: row.phone, role: row.role };
}

async function issueSession(
  executor: Executor,
  user: { id: number; email: string | null; name: string; phone: string | null; role: UserRole; tokenVersion: number },
  restaurantId: number | null,
  rememberMe: boolean,
  meta: RequestMeta,
): Promise<SessionResult> {
  const context: AuthContext = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  };
  const { token, hash } = generateRefreshToken();
  const expiresAt = refreshTokenExpiry(rememberMe);

  await executor.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hash,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 255) ?? null,
    ipAddress: meta.ipAddress?.slice(0, 45) ?? null,
  });

  return {
    accessToken: signAccessToken(context),
    refreshToken: token,
    refreshExpiresAt: expiresAt,
    user: toPublicUser(user),
    restaurantId,
  };
}

/**
 * Self-service restaurant sign-up.
 *
 * One transaction creates the user, the restaurant, the OWNER membership,
 * default settings and the ranking row. A half-created tenant — a user with no
 * restaurant, or a restaurant nobody can administer — must never exist.
 *
 * The caller cannot choose a role or join an existing restaurant: the role is
 * hard-coded to RESTAURANT_ADMIN and a fresh restaurant is always created.
 */
export async function registerRestaurant(
  input: RegisterRestaurantInput,
  meta: RequestMeta,
): Promise<SessionResult> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing.length > 0) {
    throw conflict('An account with that email already exists.', 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(
      input.restaurantName,
      async (candidate) => {
        const [row] = await tx
          .select({ id: restaurants.id })
          .from(restaurants)
          .where(eq(restaurants.slug, candidate))
          .limit(1);
        return Boolean(row);
      },
      'restaurant',
    );

    const [userInsert] = await tx.insert(users).values({
      email: input.email,
      passwordHash,
      name: input.ownerName,
      phone: input.phone,
      role: UserRole.RESTAURANT_ADMIN,
      status: UserStatus.ACTIVE,
    });

    const hasLocation = input.latitude !== undefined && input.longitude !== undefined;

    const [restaurantInsert] = await tx.insert(restaurants).values({
      slug,
      name: input.restaurantName,
      description: input.description ?? null,
      phone: input.phone,
      email: input.email,
      address: input.address,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      // New tenants start PENDING; a Super Admin activates them.
      status: RestaurantStatus.PENDING,
      onboardingStep: hasLocation ? OnboardingStep.WHATSAPP : OnboardingStep.LOCATION,
    });

    const restaurantId = restaurantInsert.insertId;

    await tx.insert(restaurantUsers).values({
      restaurantId,
      userId: userInsert.insertId,
      role: RestaurantRole.OWNER,
    });

    await tx.insert(restaurantSettings).values({
      restaurantId,
      // The number still has to be verified before it can receive orders.
      whatsappNumber: input.whatsappNumber ?? null,
    });

    await ensureRankingRow(tx, restaurantId);

    return issueSession(
      tx,
      {
        id: userInsert.insertId,
        email: input.email,
        name: input.ownerName,
        phone: input.phone,
        role: UserRole.RESTAURANT_ADMIN,
        tokenVersion: 0,
      },
      restaurantId,
      false,
      meta,
    );
  });
}

/** Shared by sign-up steps 1 and 3. */
async function assertEmailFree(email: string): Promise<void> {
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken) throw conflict('An account with that email already exists. Sign in instead.', 'EMAIL_TAKEN');
}

/** The phone must be free and not blocked. Returns a guest profile to adopt, if any. */
async function assertPhoneUsable(phone: string) {
  const [existing] = await db
    .select({ id: customers.id, userId: customers.userId, isBlocked: customers.isBlocked })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);
  if (existing?.isBlocked === 1) {
    throw forbidden('This phone number can’t be used to order. Contact support if you think this is a mistake.', 'CUSTOMER_BLOCKED');
  }
  if (existing?.userId) {
    throw conflict('An account with that phone number already exists. Sign in instead.', 'PHONE_TAKEN');
  }
  return existing ?? null;
}

/**
 * A signed, short-lived pass proving step 2 happened. Signed with a key
 * derived from (not equal to) the access-token secret, so it can never be
 * mistaken for — or used as — a session token.
 */
const SIGNUP_TOKEN_TTL = '30m';
const signupSecret = () => `${env.JWT_ACCESS_SECRET}:customer-signup`;

function signSignupToken(email: string): string {
  return jwt.sign({ email, purpose: 'customer-signup' }, signupSecret(), {
    algorithm: 'HS256',
    expiresIn: SIGNUP_TOKEN_TTL,
  });
}

function verifySignupToken(token: string): string {
  try {
    const claims = jwt.verify(token, signupSecret(), { algorithms: ['HS256'] }) as { email?: string; purpose?: string };
    if (claims.purpose !== 'customer-signup' || !claims.email) throw new Error('wrong purpose');
    return claims.email;
  } catch {
    throw badRequest('Your email confirmation has expired. Please start again.', 'SIGNUP_TOKEN_INVALID');
  }
}

/** Customer sign-up, step 1: email a code. Nothing else is asked for yet. */
export async function startCustomerSignup(email: string, ip: string | undefined): Promise<{ email: string; expiresAt: Date }> {
  await assertEmailFree(email);
  const { expiresAt } = await issueCode({ purpose: 'SIGNUP', email, ip });
  return { email, expiresAt };
}

/** Customer sign-up, step 2: the code proves the email; hand back a signup token. */
export async function verifyCustomerSignupEmail(email: string, code: string): Promise<{ signupToken: string }> {
  await assertEmailFree(email);
  await consumeCode('SIGNUP', email, code);
  return { signupToken: signSignupToken(email) };
}

/**
 * Customer sign-up, step 3: details. Every check runs again here — the email
 * or phone may have been taken since step 1.
 *
 * Someone who ordered as a guest before accounts existed already has a
 * `customers` row keyed by phone; it is adopted, so their history carries over.
 */
export async function completeCustomerSignup(input: CompleteSignupInput, meta: RequestMeta): Promise<SessionResult> {
  const email = verifySignupToken(input.signupToken);
  await assertEmailFree(email);
  const existing = await assertPhoneUsable(input.phone);
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [userInsert] = await tx.insert(users).values({
      email,
      passwordHash,
      name: input.name,
      phone: input.phone,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
    const userId = userInsert.insertId;

    if (existing) {
      await tx.update(customers).set({ userId, name: input.name, email }).where(eq(customers.id, existing.id));
    } else {
      await tx.insert(customers).values({ userId, phone: input.phone, name: input.name, email });
    }

    return issueSession(
      tx,
      { id: userId, email, name: input.name, phone: input.phone, role: UserRole.CUSTOMER, tokenVersion: 0 },
      null,
      false,
      meta,
    );
  });
}

/**
 * Forgotten password, step 1. Always answers the same way, whether or not
 * the email has an account, so it can't be used to find out who is registered.
 */
export async function requestPasswordReset(email: string, ip: string | undefined): Promise<void> {
  const [user] = await db
    .select({ id: users.id, name: users.name, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || user.status !== UserStatus.ACTIVE) return;

  try {
    await issueCode({ purpose: 'PASSWORD_RESET', email, name: user.name, ip });
  } catch (error) {
    // A cooldown would reveal the account exists; stay silent. Send failures still surface.
    if ((error as { code?: string }).code === 'CODE_COOLDOWN') return;
    throw error;
  }
}

/** Forgotten password, step 2: set the new password and sign out every device. */
export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await consumeCode('PASSWORD_RESET', email, code);
  const [user] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw badRequest('This account can’t be reset. Contact support.', 'ACCOUNT_UNAVAILABLE');
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      tokenVersion: sql`${users.tokenVersion} + 1`,
      emailVerifiedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await revokeAllSessions(user.id);
}

/**
 * Password login.
 *
 * A wrong email and a wrong password produce the same error and take the same
 * time, so the endpoint cannot be used to enumerate registered addresses.
 */
/**
 * Resolve a sign-in identifier to a user id. An "@" means email; anything
 * else is treated as a phone number and looked up on customer profiles —
 * only customers sign in by phone.
 */
async function userIdForIdentifier(identifier: string): Promise<number | null> {
  const value = identifier.trim();
  if (value.includes('@')) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, value.toLowerCase())).limit(1);
    return row?.id ?? null;
  }
  const phone = normalisePhone(value);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;

  // Riders often have no email, so their phone wins; then customers; then
  // other restaurant staff. (Anyone can always sign in with an email instead.)
  const [rider] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone), eq(users.role, UserRole.RIDER)))
    .limit(1);
  if (rider) return rider.id;

  const [customer] = await db
    .select({ userId: customers.userId })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);
  if (customer?.userId) return customer.userId;

  const [staff] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone), eq(users.role, UserRole.RESTAURANT_ADMIN)))
    .limit(1);
  return staff?.id ?? null;
}

export async function login(
  identifier: string,
  password: string,
  rememberMe: boolean,
  meta: RequestMeta,
): Promise<SessionResult> {
  const userId = await userIdForIdentifier(identifier);
  const [user] = userId === null ? [] : await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
      status: users.status,
      passwordHash: users.passwordHash,
      tokenVersion: users.tokenVersion,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    await fakeVerify();
    throw unauthorized('Email, phone or password is incorrect.', 'INVALID_CREDENTIALS');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw unauthorized('Email, phone or password is incorrect.', 'INVALID_CREDENTIALS');
  if (user.status !== UserStatus.ACTIVE) {
    throw unauthorized(
      user.role === UserRole.CUSTOMER
        ? 'This account has been blocked. Contact support if you think this is a mistake.'
        : 'This account has been suspended.',
      'ACCOUNT_SUSPENDED',
    );
  }

  const restaurantId = await findRestaurantIdForUser(user.id);

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  return issueSession(db, user, restaurantId, rememberMe, meta);
}

/**
 * Rotate a refresh token.
 *
 * The presented token is revoked and replaced. If a token that was already
 * rotated is presented again, that is a replay — the whole family is revoked,
 * forcing a fresh sign-in.
 */
export async function refreshSession(
  presentedToken: string,
  meta: RequestMeta,
): Promise<SessionResult> {
  const hash = hashToken(presentedToken);

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        expiresAt: refreshTokens.expiresAt,
        revokedAt: refreshTokens.revokedAt,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hash))
      .for('update')
      .limit(1);

    if (!row) throw unauthorized('Session not recognised. Please sign in again.', 'REFRESH_INVALID');

    if (row.revokedAt !== null) {
      // Replay of a rotated token: assume theft and drop every live session.
      await tx.update(refreshTokens).set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
      // Return the error so revocations commit before the request is rejected.
      return { error: unauthorized('Session reuse detected. Please sign in again.', 'REFRESH_REPLAYED') };
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      throw unauthorized('Your session has expired. Please sign in again.', 'REFRESH_EXPIRED');
    }

    const [user] = await tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        role: users.role,
        status: users.status,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw unauthorized('Account is not available.', 'ACCOUNT_UNAVAILABLE');
    }

    const restaurantId = await findRestaurantIdForUser(user.id, tx);

    const session = await issueSession(tx, user, restaurantId, false, meta);
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedByHash: hashToken(session.refreshToken) })
      .where(eq(refreshTokens.id, row.id));
    return { session };
  });
  if (result.error) throw result.error;
  return result.session;
}

export async function revokeSession(presentedToken: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, hashToken(presentedToken)), isNull(refreshTokens.revokedAt)));
}

export async function revokeAllSessions(userId: number): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function findRestaurantIdForUser(userId: number, executor: Executor = db): Promise<number | null> {
  const [row] = await executor
    .select({ restaurantId: restaurantUsers.restaurantId })
    .from(restaurantUsers)
    .where(eq(restaurantUsers.userId, userId))
    .limit(1);
  return row?.restaurantId ?? null;
}

export async function getMe(userId: number): Promise<{
  user: PublicUser;
  restaurant: {
    id: number;
    name: string;
    slug: string;
    status: RestaurantStatus;
    onboardingStep: OnboardingStep;
    statusReason: string | null;
    /** The signed-in person's place in this restaurant. */
    role: RestaurantRole;
    permissions: StaffPermission[];
  } | null;
  customer: { id: number; name: string; phone: string; email: string | null } | null;
}> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw unauthorized();

  const [restaurant] = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      status: restaurants.status,
      onboardingStep: restaurants.onboardingStep,
      statusReason: restaurants.suspendedReason,
      role: restaurantUsers.role,
      permissions: restaurantUsers.permissions,
    })
    .from(restaurantUsers)
    .innerJoin(restaurants, eq(restaurants.id, restaurantUsers.restaurantId))
    .where(eq(restaurantUsers.userId, userId))
    .limit(1);

  const [customer] =
    user.role === UserRole.CUSTOMER
      ? await db
          .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email })
          .from(customers)
          .where(eq(customers.userId, userId))
          .limit(1)
      : [];

  const membership = restaurant
    ? {
        ...restaurant,
        permissions:
          restaurant.role === RestaurantRole.OWNER
            ? Object.values(StaffPermission)
            : restaurant.role === RestaurantRole.RIDER
              ? []
              : ((restaurant.permissions ?? []) as StaffPermission[]),
      }
    : null;

  return { user: toPublicUser(user), restaurant: membership, customer: customer ?? null };
}

/** Housekeeping: drop refresh rows that are long dead. */
export async function pruneExpiredTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(refreshTokens)
    .where(or(lt(refreshTokens.expiresAt, cutoff), and(lt(refreshTokens.revokedAt, cutoff), gt(refreshTokens.id, 0))));
  return result[0].affectedRows;
}
