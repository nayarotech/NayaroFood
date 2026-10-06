import { index, mysqlTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { fk, pk, timestamps } from './_shared.js';
import { restaurants } from './restaurants.js';
import { users } from './users.js';

/**
 * Web Push subscriptions — one per browser/device that opted in.
 *
 * This is what makes a new order reach a restaurant when the dashboard is
 * closed: the browser's push service holds the connection, not our server.
 * The keys are per-subscription secrets supplied by the browser; they are
 * useless without the matching VAPID private key, which stays in env.
 */
export const pushSubscriptions = mysqlTable(
  'push_subscriptions',
  {
    id: pk(),
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    userId: fk('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The push service URL. Unique — re-subscribing must not duplicate a device. */
    endpoint: varchar('endpoint', { length: 500 }).notNull(),
    p256dh: varchar('p256dh', { length: 255 }).notNull(),
    auth: varchar('auth', { length: 255 }).notNull(),
    userAgent: varchar('user_agent', { length: 255 }),
    /** Cleared on a successful send; used to retire dead endpoints. */
    lastFailureAt: timestamp('last_failure_at'),
    lastError: text('last_error'),
    lastSentAt: timestamp('last_sent_at'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('uq_push_endpoint').on(t.endpoint),
    index('idx_push_tenant').on(t.restaurantId),
  ],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
