import { relations } from 'drizzle-orm';
import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  OnboardingStep,
  RestaurantRole,
  RestaurantStatus,
  WhatsAppStatus,
  enumValues,
} from '@nayaro/shared';
import { coordinate, deletedAt, fk, money, pk, timestamps } from './_shared.js';
import { users } from './users.js';

/**
 * The tenant root. Every tenant-owned row in this database carries a
 * `restaurant_id` pointing here, and every tenant-scoped query filters on it.
 *
 * Location lives on this table because a restaurant has exactly one address
 * today; multi-branch would add a `restaurant_branches` table and move the
 * coordinate columns there without disturbing anything else.
 */
export const restaurants = mysqlTable(
  'restaurants',
  {
    id: pk(),
    /** Public URL segment: /r/hotel-abc */
    slug: varchar('slug', { length: 120 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),
    logoUrl: varchar('logo_url', { length: 500 }),
    coverUrl: varchar('cover_url', { length: 500 }),
    phone: varchar('phone', { length: 20 }).notNull(),
    email: varchar('email', { length: 190 }),
    address: varchar('address', { length: 255 }).notNull(),
    /** Origin for every delivery-distance calculation. Null until onboarding sets it. */
    latitude: coordinate('latitude'),
    longitude: coordinate('longitude'),
    status: mysqlEnum('status', enumValues(RestaurantStatus))
      .notNull()
      .default(RestaurantStatus.PENDING),
    /** Restaurant's own open/closed toggle, independent of platform status. */
    isOpen: int('is_open').notNull().default(1),
    onboardingStep: mysqlEnum('onboarding_step', enumValues(OnboardingStep))
      .notNull()
      .default(OnboardingStep.PROFILE),
    /** Shown to the owner while the restaurant is SUSPENDED or INACTIVE. */
    suspendedReason: varchar('suspended_reason', { length: 300 }),
    /** First time a Super Admin verified the restaurant. Never cleared. */
    approvedAt: timestamp('approved_at'),
    statusChangedAt: timestamp('status_changed_at'),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('uq_restaurants_slug').on(t.slug),
    index('idx_restaurants_status').on(t.status, t.deletedAt),
    index('idx_restaurants_name').on(t.name),
  ],
);

/**
 * Tenant membership. This join table — not a column on `users` — is the single
 * source of truth for "which restaurant may this user act on", and supports
 * multiple staff per restaurant from day one.
 */
export const restaurantUsers = mysqlTable(
  'restaurant_users',
  {
    id: pk(),
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    userId: fk('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: mysqlEnum('role', enumValues(RestaurantRole)).notNull().default(RestaurantRole.OWNER),
    /** Granted by the owner to a manager; ignored for the owner (all) and riders (none). */
    permissions: json('permissions').$type<string[]>(),
    /** Switched off instead of deleted, so their order history keeps a name. */
    isActive: int('is_active').notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('uq_restaurant_users').on(t.restaurantId, t.userId),
    index('idx_restaurant_users_user').on(t.userId),
  ],
);

/**
 * One settings row per restaurant, created with the restaurant.
 *
 * `nextOrderNumber` is the per-tenant order counter: reserved under a row lock
 * inside the order transaction, so restaurants see #1001, #1002 … rather than
 * a global id that would leak platform-wide volume.
 */
export const restaurantSettings = mysqlTable(
  'restaurant_settings',
  {
    restaurantId: fk('restaurant_id')
      .primaryKey()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    currency: varchar('currency', { length: 3 }).notNull().default('NPR'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kathmandu'),
    minOrderAmount: money('min_order_amount').notNull().default('0.00'),
    defaultPrepTimeMinutes: int('default_prep_time_minutes').notNull().default(30),
    acceptsOrders: int('accepts_orders').notNull().default(1),
    orderNumberPrefix: varchar('order_number_prefix', { length: 8 }).notNull().default(''),
    nextOrderNumber: int('next_order_number').notNull().default(1001),

    /** Destination for order notifications. Only ever used when status is VERIFIED. */
    whatsappNumber: varchar('whatsapp_number', { length: 20 }),
    whatsappStatus: mysqlEnum('whatsapp_status', enumValues(WhatsAppStatus))
      .notNull()
      .default(WhatsAppStatus.UNVERIFIED),
    whatsappVerifiedAt: timestamp('whatsapp_verified_at'),

    ...timestamps(),
  },
  (t) => [index('idx_restaurant_settings_whatsapp').on(t.whatsappStatus)],
);

export const restaurantsRelations = relations(restaurants, ({ one, many }) => ({
  settings: one(restaurantSettings, {
    fields: [restaurants.id],
    references: [restaurantSettings.restaurantId],
  }),
  members: many(restaurantUsers),
}));

export const restaurantUsersRelations = relations(restaurantUsers, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantUsers.restaurantId],
    references: [restaurants.id],
  }),
  user: one(users, { fields: [restaurantUsers.userId], references: [users.id] }),
}));

export const restaurantSettingsRelations = relations(restaurantSettings, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantSettings.restaurantId],
    references: [restaurants.id],
  }),
}));

export type RestaurantRow = typeof restaurants.$inferSelect;
export type RestaurantSettingsRow = typeof restaurantSettings.$inferSelect;
export type RestaurantUserRow = typeof restaurantUsers.$inferSelect;
