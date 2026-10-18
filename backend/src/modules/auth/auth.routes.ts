import { Router, type Response } from 'express';
import {
  changePasswordSchema,
  loginSchema,
  forgotPasswordSchema,
  completeSignupSchema,
  startSignupSchema,
  registerRestaurantSchema,
  resendCodeSchema,
  resetPasswordSchema,
  verifySignupSchema,
  type ResetPasswordInput,
  type VerifySignupInput,
  updateProfileSchema,
  type ChangePasswordInput,
  type LoginInput,
  type CompleteSignupInput,
  type RegisterRestaurantInput,
  type UpdateProfileInput,
} from '@nayaro/shared';
import { emitRealtime } from '../realtime/events.js';
import { env, isProduction } from '../../config/env.js';
import { authLimiter, emailCodeLimiter, otpVerifyLimiter } from '../../http/middleware/rate-limit.js';
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
  completeCustomerSignup,
  refreshSession,
  registerRestaurant,
  requestPasswordReset,
  verifyCustomerSignupEmail,
  resetPassword,
  startCustomerSignup,
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

/**
 * Customer sign-up, in three steps: email → code → details. The email is
 * proven before anything else is asked for. Restaurants use /register.
 */
authRouter.post(
  '/register-customer/start',
  emailCodeLimiter,
  validateBody(startSignupSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email: string };
    created(res, await startCustomerSignup(email, req.ip));
  }),
);

authRouter.post(
  '/register-customer/resend',
  emailCodeLimiter,
  validateBody(resendCodeSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email: string };
    ok(res, await startCustomerSignup(email, req.ip));
  }),
);

authRouter.post(
  '/register-customer/verify',
  otpVerifyLimiter,
  validateBody(verifySignupSchema),
  asyncHandler(async (req, res) => {
    const { email, code } = req.body as VerifySignupInput;
    ok(res, await verifyCustomerSignupEmail(email, code));
  }),
);

authRouter.post(
  '/register-customer/complete',
  authLimiter,
  validateBody(completeSignupSchema),
  asyncHandler(async (req, res) => {
    const session = await completeCustomerSignup(req.body as CompleteSignupInput, metaOf(req));
    setSessionCookies(res, session);
    created(res, { user: session.user, restaurantId: null, accessToken: session.accessToken });
  }),
);

/** Forgotten password: always 200, so it never reveals whether an email is registered. */
authRouter.post(
  '/password/forgot',
  emailCodeLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email: string };
    await requestPasswordReset(email, req.ip);
    ok(res, { email });
  }),
);

authRouter.post(
  '/password/reset',
  otpVerifyLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email, code, newPassword } = req.body as ResetPasswordInput;
    await resetPassword(email, code, newPassword);
    clearSessionCookies(res);
    ok(res, { reset: true });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { identifier, password, rememberMe } = req.body as LoginInput;
    const session = await login(identifier, password, rememberMe, metaOf(req));
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
