import { eq, sql } from 'drizzle-orm';
import { UserRole, UserStatus, emailSchema, passwordSchema } from '@nayaro/shared';
import { closeDatabase, db } from './client.js';
import { users } from './schema/index.js';
import { hashPassword } from '../lib/password.js';

/**
 * Create (or reset) the production Super Admin.
 *
 * Reads ADMIN_EMAIL, ADMIN_PASSWORD and optionally ADMIN_NAME from the
 * environment, so it can be run from a hosting panel's "Run script" button.
 * Unlike `db:seed`, it creates no demo restaurants and no demo password.
 * Remove ADMIN_PASSWORD from .env once it has run.
 */
async function main(): Promise<void> {
  const email = emailSchema.safeParse(process.env.ADMIN_EMAIL ?? '');
  const password = passwordSchema.safeParse(process.env.ADMIN_PASSWORD ?? '');
  const name = (process.env.ADMIN_NAME ?? 'Platform Admin').trim().slice(0, 120) || 'Platform Admin';

  if (!email.success) throw new Error('Set ADMIN_EMAIL in .env to a valid email address.');
  if (!password.success) throw new Error('Set ADMIN_PASSWORD in .env (at least 10 characters).');

  const passwordHash = await hashPassword(password.data);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.data)).limit(1);

  if (existing) {
    // Reset: new password, promoted to Super Admin, every old session revoked.
    await db
      .update(users)
      .set({
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, existing.id));
    console.log(`✓ Updated ${email.data}: password reset and Super Admin role confirmed.`);
  } else {
    await db.insert(users).values({
      email: email.data,
      name,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
    });
    console.log(`✓ Created Super Admin ${email.data}.`);
  }
  console.log('Now remove ADMIN_PASSWORD from .env.');
}

main()
  .catch((error: unknown) => {
    console.error('✗', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
