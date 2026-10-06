import { and, eq } from 'drizzle-orm';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { RestaurantStatus, UserRole, UserStatus } from '@nayaro/shared';
import { db } from '../../db/client.js';
import { restaurantUsers, restaurants, users } from '../../db/schema/index.js';
import { verifyAccessToken } from '../../lib/tokens.js';
import { forbidden, notFound, unauthorized } from '../errors.js';
import { asyncHandler } from './validate.js';

/**
 * Authentication and tenant resolution.
 *
 * The whole multi-tenant security model rests on one rule enforced here: a
 * request's `restaurant_id` is derived from the caller's membership row, never
 * read from the URL, body or query. `req.tenant` is the only value downstream
 * code is allowed to treat as a tenant identity.
 */

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  // The web client keeps the access token in an httpOnly cookie.
  const cookie = (req.cookies as Record<string, string> | undefined)?.access_token;
  return cookie ?? null;
}

/** Rejects anything without a valid, current access token. */
export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) throw unauthorized();

  const claims = verifyAccessToken(token);
  if (!claims) throw unauthorized('Your session has expired. Please sign in again.', 'TOKEN_INVALID');

  // Re-read the user so a suspension or password change takes effect at once,
  // rather than lingering until the access token happens to expire.
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      tokenVersion: users.tokenVersion,
    })
    .from(users)
    .where(eq(users.id, claims.userId))
    .limit(1);

  if (!user) throw unauthorized('Account no longer exists.', 'ACCOUNT_GONE');
  if (user.status !== UserStatus.ACTIVE) {
    throw forbidden('This account has been suspended.', 'ACCOUNT_SUSPENDED');
  }
  if (user.tokenVersion !== claims.tokenVersion) {
    throw unauthorized('Your session is no longer valid. Please sign in again.', 'TOKEN_STALE');
  }

  req.auth = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  };
  next();
});

/** Platform-role gate. Use `requireSuperAdmin` for the Super Admin surface. */
export function requireRole(...allowed: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!allowed.includes(req.auth.role)) {
      return next(forbidden('You do not have access to this resource.'));
    }
    next();
  };
}

export const requireSuperAdmin: RequestHandler = requireRole(UserRole.SUPER_ADMIN);

/**
 * Resolve the tenant the caller may act on, and attach it as `req.tenant`.
 *
 * A restaurant admin gets exactly the restaurant they are a member of. A Super
 * Admin may act on any restaurant, but only by naming it explicitly via the
 * `X-Restaurant-Id` header — so cross-tenant access is always deliberate.
 */
export const requireRestaurant: RequestHandler = asyncHandler(async (req, _res, next) => {
  const auth = req.auth;
  if (!auth) throw unauthorized();

  if (auth.role === UserRole.SUPER_ADMIN) {
    const header = req.headers['x-restaurant-id'];
    const requested = Number(Array.isArray(header) ? header[0] : header);
    if (!Number.isInteger(requested) || requested <= 0) {
      throw forbidden(
        'Super Admin requests must name a restaurant via the X-Restaurant-Id header.',
        'RESTAURANT_NOT_SPECIFIED',
      );
    }
    const [restaurant] = await db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.id, requested))
      .limit(1);
    if (!restaurant) throw notFound('Restaurant not found.', 'RESTAURANT_NOT_FOUND');

    req.tenant = { restaurantId: restaurant.id, restaurantRole: null, viaSuperAdmin: true };
    return next();
  }

  const [membership] = await db
    .select({
      restaurantId: restaurantUsers.restaurantId,
      restaurantRole: restaurantUsers.role,
      status: restaurants.status,
    })
    .from(restaurantUsers)
    .innerJoin(restaurants, eq(restaurants.id, restaurantUsers.restaurantId))
    .where(eq(restaurantUsers.userId, auth.userId))
    .limit(1);

  if (!membership) {
    throw forbidden('Your account is not linked to a restaurant.', 'NO_RESTAURANT');
  }
  if (membership.status === RestaurantStatus.SUSPENDED) {
    throw forbidden('This restaurant has been suspended by the platform.', 'RESTAURANT_SUSPENDED');
  }

  req.tenant = {
    restaurantId: membership.restaurantId,
    restaurantRole: membership.restaurantRole,
    viaSuperAdmin: false,
  };
  next();
});

/**
 * The accessor every tenant-scoped query must use.
 *
 * Throwing rather than returning null means a handler that forgets the guard
 * fails loudly instead of silently querying across tenants.
 */
export function tenantOf(req: Request): number {
  if (!req.tenant) {
    throw new Error(
      'Tenant context missing — this route must be mounted behind requireRestaurant.',
    );
  }
  return req.tenant.restaurantId;
}

export function authOf(req: Request): { userId: number; role: UserRole } {
  if (!req.auth) throw new Error('Auth context missing — mount behind requireAuth.');
  return { userId: req.auth.userId, role: req.auth.role };
}

/** Attaches auth when a token is present, but never rejects. For mixed routes. */
export const optionalAuth: RequestHandler = (req, res, next) => {
  if (!bearerToken(req)) return next();
  requireAuth(req, res, (error?: unknown) => {
    if (error) {
      delete req.auth;
    }
    next();
  });
};

export type { NextFunction, Response };
