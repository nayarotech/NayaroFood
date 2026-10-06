import {
  index,
  int,
  json,
  mediumtext,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { fk, pk, timestamps, updatedAt } from './_shared.js';
import { restaurants } from './restaurants.js';
import { users } from './users.js';

/** Key/value platform configuration the Super Admin can change without a deploy. */
export const platformSettings = mysqlTable('platform_settings', {
  key: varchar('setting_key', { length: 100 }).primaryKey(),
  value: json('setting_value'),
  description: varchar('description', { length: 300 }),
  updatedByUserId: fk('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  updatedAt: updatedAt(),
});

/**
 * Security-relevant actions: suspensions, role changes, WhatsApp number
 * changes, zone rewrites. Append-only; `restaurantId` is null for
 * platform-level events.
 */
export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id: pk(),
    restaurantId: fk('restaurant_id').references(() => restaurants.id, {
      onDelete: 'set null',
    }),
    actorUserId: fk('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }),
    entityId: varchar('entity_id', { length: 64 }),
    metadata: json('metadata'),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_audit_logs_tenant').on(t.restaurantId, t.createdAt),
    index('idx_audit_logs_actor').on(t.actorUserId, t.createdAt),
    index('idx_audit_logs_action').on(t.action, t.createdAt),
  ],
);

export type AuditLogRow = typeof auditLogs.$inferSelect;

/**
 * Standalone content pages — About, Privacy policy, Terms, Contact …
 * Edited by the Super Admin; served at /<slug> on the public site.
 */
export const sitePages = mysqlTable(
  'site_pages',
  {
    id: pk(),
    slug: varchar('slug', { length: 60 }).notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    summary: varchar('summary', { length: 300 }).notNull().default(''),
    /** Lightweight Markdown, rendered with HTML escaped. */
    body: mediumtext('body').notNull(),
    showContactForm: int('show_contact_form').notNull().default(0),
    isPublished: int('is_published').notNull().default(1),
    showInFooter: int('show_in_footer').notNull().default(1),
    sortOrder: int('sort_order').notNull().default(0),
    updatedByUserId: fk('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('uq_site_pages_slug').on(t.slug), index('idx_site_pages_footer').on(t.isPublished, t.showInFooter, t.sortOrder)],
);

/** Messages sent through the public Contact form, read in the admin inbox. */
export const contactMessages = mysqlTable(
  'contact_messages',
  {
    id: pk(),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 190 }),
    phone: varchar('phone', { length: 30 }),
    topic: varchar('topic', { length: 20 }).notNull().default('general'),
    message: text('message').notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_contact_messages_inbox').on(t.readAt, t.createdAt)],
);

export type SitePageRow = typeof sitePages.$inferSelect;
export type ContactMessageRow = typeof contactMessages.$inferSelect;
