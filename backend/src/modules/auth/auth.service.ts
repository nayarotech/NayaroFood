import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import {
  OnboardingStep,
  RestaurantRole,
  RestaurantStatus,
  UserRole,
  UserStatus,
  slugify,
  type RegisterRestaurantInput,
} from '@nayaro/shared';
import { db, type Executor } from '../../db/client.js';
import {
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
import { conflict, unauthorized } from '../../http/errors.js';
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
  email: string;
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
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
}): PublicUser {
  return { id: row.id, email: row.email, name: row.name, phone: row.phone, role: row.role };
}

async function issueSession(
  executor: Executor,
  user: { id: number; email: string; name: string; phone: string | null; role: UserRole; tokenVersion: number },
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

/**
 * Password login.
 *
 * A wrong email and a wrong password produce the same error and take the same
 * time, so the endpoint cannot be used to enumerate registered addresses.
 */
export async function login(
  email: string,
  password: string,
  rememberMe: boolean,
  meta: RequestMeta,
): Promise<SessionResult> {
  const [user] = await db
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
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    await fakeVerify();
    throw unauthorized('Email or password is incorrect.', 'INVALID_CREDENTIALS');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw unauthorized('Email or password is incorrect.', 'INVALID_CREDENTIALS');
  if (user.status !== UserStatus.ACTIVE) {
    throw unauthorized('This account has been suspended.', 'ACCOUNT_SUSPENDED');
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

  const [row] = await db
    .select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      expiresAt: refreshTokens.expiresAt,
      revokedAt: refreshTokens.revokedAt,
    })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hash))
    .limit(1);

  if (!row) throw unauthorized('Session not recognised. Please sign in again.', 'REFRESH_INVALID');

  if (row.revokedAt !== null) {
    // Replay of a rotated token: assume theft and drop every live session.
    await revokeAllSessions(row.userId);
    throw unauthorized('Session reuse detected. Please sign in again.', 'REFRESH_REPLAYED');
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('Your session has expired. Please sign in again.', 'REFRESH_EXPIRED');
  }

  const [user] = await db
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

  const restaurantId = await findRestaurantIdForUser(user.id);

  return db.transaction(async (tx) => {
    const session = await issueSession(tx, user, restaurantId, false, meta);
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedByHash: hashToken(session.refreshToken) })
      .where(eq(refreshTokens.id, row.id));
    return session;
  });
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

export async function findRestaurantIdForUser(userId: number): Promise<number | null> {
  const [row] = await db
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
  } | null;
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
    })
    .from(restaurantUsers)
    .innerJoin(restaurants, eq(restaurants.id, restaurantUsers.restaurantId))
    .where(eq(restaurantUsers.userId, userId))
    .limit(1);

  return { user: toPublicUser(user), restaurant: restaurant ?? null };
}

/** Housekeeping: drop refresh rows that are long dead. */
export async function pruneExpiredTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(refreshTokens)
    .where(or(lt(refreshTokens.expiresAt, cutoff), and(lt(refreshTokens.revokedAt, cutoff), gt(refreshTokens.id, 0))));
  return result[0].affectedRows;
}
