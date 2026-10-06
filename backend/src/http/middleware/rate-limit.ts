import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';

/**
 * Rate limiters, tightest first. Limits are keyed by IP *and*, where it
 * matters, by the identifier being attacked (email, phone), so one attacker
 * cannot lock out every user by hammering a shared endpoint.
 *
 * Counters are in-process today. Behind more than one API instance this must
 * move to a shared store (Redis) or each instance enforces its own share.
 */

const disabled: RequestHandler = (_req, _res, next) => next();

function limiter(options: Partial<Options> & { limit: number; windowMs: number }): RequestHandler {
  if (!env.RATE_LIMIT_ENABLED) return disabled;
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
    ...options,
  });
}

/** For one-off limits defined next to the route that needs them. */
export const limiterFor = limiter;

/** Blanket ceiling for the whole API. */
export const globalLimiter = limiter({ windowMs: 60_000, limit: 300 });


/** Login and registration: slow enough to make credential stuffing useless. */
export const authLimiter = limiter({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `${ipKeyGenerator(req.ip ?? "")}:${email}`;
  },
});

/** Sending an OTP costs money and annoys the recipient — keep it rare. */
export const otpRequestLimiter = limiter({
  windowMs: 60 * 60_000,
  limit: 5,
  keyGenerator: (req) => {
    const phone = typeof req.body?.whatsappNumber === 'string' ? req.body.whatsappNumber : '';
    return `${ipKeyGenerator(req.ip ?? "")}:${phone}`;
  },
});

/** Guessing an OTP. The per-row attempt ceiling is the real defence; this is depth. */
export const otpVerifyLimiter = limiter({ windowMs: 15 * 60_000, limit: 20 });

/** Order placement, to stop a script filling a restaurant's dashboard with junk. */
export const orderLimiter = limiter({ windowMs: 10 * 60_000, limit: 15 });

/** Public browsing is cheap but still cacheable-abusable. */
export const publicReadLimiter = limiter({ windowMs: 60_000, limit: 120 });
