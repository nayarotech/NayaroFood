import { relations } from 'drizzle-orm';
import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';
import { NotificationChannel, NotificationStatus, enumValues } from '@nayaro/shared';
import { fk, pk, timestamps } from './_shared.js';
import { orders } from './orders.js';
import { restaurants } from './restaurants.js';

/**
 * One row per outbound notification attempt.
 *
 * Delivery of a WhatsApp message is deliberately decoupled from order validity:
 * an order is committed first, a log row is written, and a send failure only
 * ever marks this row FAILED. The dashboard reads these rows to show whether
 * the restaurant was actually reached.
 */
export const notificationLogs = mysqlTable(
  'notification_logs',
  {
    id: pk(),
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    /** Null for non-order notifications such as WhatsApp verification codes. */
    orderId: fk('order_id').references(() => orders.id, { onDelete: 'set null' }),
    channel: mysqlEnum('channel', enumValues(NotificationChannel))
      .notNull()
      .default(NotificationChannel.WHATSAPP),
    /** Which adapter handled it: "log", "meta-cloud", "twilio", … */
    provider: varchar('provider', { length: 40 }).notNull(),
    template: varchar('template', { length: 60 }).notNull(),
    recipient: varchar('recipient', { length: 20 }).notNull(),
    status: mysqlEnum('status', enumValues(NotificationStatus))
      .notNull()
      .default(NotificationStatus.PENDING),
    attempts: int('attempts').notNull().default(0),
    providerMessageId: varchar('provider_message_id', { length: 128 }),
    /** Rendered message body, kept for support and for resend. */
    payload: json('payload'),
    error: text('error'),
    sentAt: timestamp('sent_at'),
    ...timestamps(),
  },
  (t) => [
    index('idx_notification_logs_order').on(t.orderId),
    index('idx_notification_logs_tenant').on(t.restaurantId, t.status, t.createdAt),
    index('idx_notification_logs_retry').on(t.status, t.attempts),
  ],
);

export const notificationLogsRelations = relations(notificationLogs, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [notificationLogs.restaurantId],
    references: [restaurants.id],
  }),
  order: one(orders, { fields: [notificationLogs.orderId], references: [orders.id] }),
}));

export type NotificationLogRow = typeof notificationLogs.$inferSelect;
