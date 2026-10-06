import { relations } from 'drizzle-orm';
import { index, int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { fk, pk, timestamps } from './_shared.js';
import { restaurants } from './restaurants.js';
import { users } from './users.js';

/**
 * Pending WhatsApp number verifications.
 *
 * The OTP is stored only as a SHA-256 hash, expires, and has a hard attempt
 * ceiling — a leaked database row cannot be turned back into a usable code,
 * and a live row cannot be brute-forced.
 */
export const whatsappVerifications = mysqlTable(
  'whatsapp_verifications',
  {
    id: pk(),
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    /** The number being proven, in E.164. */
    phone: varchar('phone', { length: 20 }).notNull(),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    attempts: int('attempts').notNull().default(0),
    maxAttempts: int('max_attempts').notNull().default(5),
    /** Set the moment the correct code is submitted; a row is single-use. */
    consumedAt: timestamp('consumed_at'),
    /** Set when superseded by a newer code for the same number. */
    invalidatedAt: timestamp('invalidated_at'),
    requestedByUserId: fk('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    requestIp: varchar('request_ip', { length: 45 }),
    ...timestamps(),
  },
  (t) => [
    index('idx_whatsapp_verifications_lookup').on(t.restaurantId, t.phone, t.consumedAt),
    index('idx_whatsapp_verifications_expiry').on(t.expiresAt),
  ],
);

export const whatsappVerificationsRelations = relations(whatsappVerifications, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [whatsappVerifications.restaurantId],
    references: [restaurants.id],
  }),
}));

export type WhatsAppVerificationRow = typeof whatsappVerifications.$inferSelect;
