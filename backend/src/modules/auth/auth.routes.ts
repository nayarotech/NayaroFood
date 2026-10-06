import { Router, type Response } from 'express';
import {
  changePasswordSchema,
  loginSchema,
  registerRestaurantSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterRestaurantInput,
  type UpdateProfileInput,
} from '@nayaro/shared';
import { emitRealtime } from '../realtime/events.js';
import { env, isProduction } from '../../config/env.js';
import { authLimiter } from '../../http/middleware/rate-limit.js';
import { requireAuth, authOf } from '../../http/middleware/auth.js';
import { asyncHandler, validateBody } from '../../http/middleware/validate.js';
import { created, noContent, ok } from '../../http/respond.js';
import { badRequest, unauthorized } from '../../http/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';
import {
  getMe,
  login,
  refreshSession,
  registerRestaurant,
  revokeAllSessions,
  revokeSession,
  type SessionResult,
} from './auth.service.js';

export const authRouter: Router = Router();

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

/**
 * Tokens live in httpOnly cookies, so no script on the page can read them —
 * an XSS bug cannot exfiltrate a session. `sameSite: lax` is sufficient
 * because the web app and API share a registrable domain in every environment.
 */
function setSessionCookies(res: Response, session: SessionResult): void {
  const base = {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProduction,
    sameSite: 'lax' as const,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };

  res.cookie(ACCESS_COOKIE, session.accessToken, {
    ...base,
    path: '/',
    maxAge: 15 * 60 * 1000,
  });

  // Scoped to the auth routes, so it is not sent with every ordinary request.
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...base,
    path: '/api/v1/auth',
    expires: session.refreshExpiresAt,
  });
}

function clearSessionCookies(res: Response): void {
  const base = {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProduction,
    sameSite: 'lax' as const,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/v1/auth' });
}

const metaOf = (req: { headers: Record<string, unknown>; ip?: string | undefined }) => ({
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
  ipAddress: req.ip,
});

authRouter.post(
  '/register',
  authLimiter,
  validateBody(registerRestaurantSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as RegisterRestaurantInput;
    const session = await registerRestaurant(input, metaOf(req));
    setSessionCookies(res, session);
    if (session.restaurantId) {
      // Lets the Super Admin console show a new application without a refresh.
      emitRealtime({
        type: 'restaurant.registered',
        restaurantId: session.restaurantId,
        name: input.restaurantName,
      });
    }
    // The access token is also returned for non-browser clients.
    created(res, {
      user: session.user,
      restaurantId: session.restaurantId,
      accessToken: session.accessToken,
    });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, rememberMe } = req.body as LoginInput;
    const session = await login(email, password, rememberMe, metaOf(req));
    setSessionCookies(res, session);
    ok(res, {
      user: session.user,
      restaurantId: session.restaurantId,
      accessToken: session.accessToken,
    });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('No session to refresh.', 'NO_REFRESH_TOKEN');

    try {
      const session = await refreshSession(token, metaOf(req));
      setSessionCookies(res, session);
      ok(res, {
        user: session.user,
        restaurantId: session.restaurantId,
        accessToken: session.accessToken,
      });
    } catch (error) {
      // A dead session should not leave a stale cookie behind to retry with.
      clearSessionCookies(res);
      throw error;
    }
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (token) await revokeSession(token);
    clearSessionCookies(res);
    noContent(res);
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    ok(res, await getMe(authOf(req).userId));
  }),
);

/** The signed-in person's own name and phone — not the restaurant's. */
authRouter.patch(
  '/profile',
  requireAuth,
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as UpdateProfileInput;
    const { userId } = authOf(req);
    if (input.name !== undefined || input.phone !== undefined) {
      await db
        .update(users)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
        })
        .where(eq(users.id, userId));
    }
    ok(res, await getMe(userId));
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as ChangePasswordInput;
    const { userId } = authOf(req);

    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw unauthorized();

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest('Your current password is incorrect.', 'WRONG_PASSWORD');
    }

    // Bumping tokenVersion invalidates every access token already issued.
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(newPassword),
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, userId));

    await revokeAllSessions(userId);
    clearSessionCookies(res);
    noContent(res);
  }),
);
