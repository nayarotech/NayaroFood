import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * Password hashing. bcrypt with a per-hash salt and a configurable cost; the
 * cost is embedded in the hash, so raising BCRYPT_ROUNDS later does not
 * invalidate existing passwords.
 */

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Compare against a dummy hash so that a login attempt for an address with no
 * account takes the same time as one for a real account. Without this, response
 * timing reveals which email addresses are registered.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7fFBpH7YDVNfVDp6Uy3kBLYhBB5Ovpu';

export async function fakeVerify(): Promise<void> {
  await bcrypt.compare('not-a-real-password', DUMMY_HASH);
}
