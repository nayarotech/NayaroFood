import { index, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { UserRole, UserStatus, enumValues } from '@nayaro/shared';
import { createdAt, fk, pk, timestamps } from './_shared.js';

/**
 * Platform accounts. A user's *tenant* access is never stored here — it comes
 * from `restaurant_users`, so no column on this table can be tampered with to
 * reach another restaurant's data.
 */
export const users = mysqlTable(
  'users',
  {
    id: pk(),
    email: varchar('email', { length: 190 }).notNull(),
    /** bcrypt hash. Never selected into any API response. */
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    role: mysqlEnum('role', enumValues(UserRole)).notNull().default(UserRole.RESTAURANT_ADMIN),
    status: mysqlEnum('status', enumValues(UserStatus)).notNull().default(UserStatus.ACTIVE),
    emailVerifiedAt: timestamp('email_verified_at'),
    lastLoginAt: timestamp('last_login_at'),
    /** Invalidates every issued token when bumped — used on password change. */
    tokenVersion: fk('token_version').notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex('uq_users_email').on(t.email), index('idx_users_role_status').on(t.role, t.status)],
);

/**
 * Refresh-token family. Only the SHA-256 hash is stored, so a database leak
 * does not hand over usable sessions. Rotation revokes the parent and records
 * the child, which makes replay of a stolen token detectable.
 */
export const refreshTokens = mysqlTable(
  'refresh_tokens',
  {
    id: pk(),
    userId: fk('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    replacedByHash: varchar('replaced_by_hash', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('uq_refresh_tokens_hash').on(t.tokenHash),
    index('idx_refresh_tokens_user').on(t.userId, t.expiresAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
