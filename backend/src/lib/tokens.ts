import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthContext } from '../modules/auth/auth.types.js';

/**
 * Token handling.
 *
 * Access tokens are short-lived JWTs held in memory by the client. Refresh
 * tokens are opaque random strings stored as SHA-256 hashes, so a database
 * leak yields no usable session. Rotation replaces the row on every use.
 */

export interface AccessTokenClaims extends AuthContext {
  iat: number;
  exp: number;
}

export function signAccessToken(context: AuthContext): string {
  return jwt.sign(
    {
      userId: context.userId,
      email: context.email,
      role: context.role,
      tokenVersion: context.tokenVersion,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'], algorithm: 'HS256' },
  );
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  try {
    // Pinning the algorithm blocks the "alg: none" and RS/HS confusion attacks.
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenClaims;
  } catch {
    return null;
  }
}

/** A refresh token the client never lets us see again in plaintext form. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Numeric OTP with uniform digit distribution — never `Math.random`. */
export function generateNumericCode(length: number): string {
  let code = '';
  while (code.length < length) {
    for (const byte of randomBytes(length)) {
      // Reject the tail of the byte range so digits stay uniformly distributed.
      if (byte >= 250) continue;
      code += String(byte % 10);
      if (code.length === length) break;
    }
  }
  return code;
}

/** Constant-time compare, for anything an attacker could probe by timing. */
export function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function refreshTokenExpiry(rememberMe: boolean): Date {
  const days = rememberMe ? env.REFRESH_TOKEN_TTL_DAYS_REMEMBER : env.REFRESH_TOKEN_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
