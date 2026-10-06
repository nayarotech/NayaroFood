import { relations } from 'drizzle-orm';
import { index, int, mysqlTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { coordinate, fk, money, pk, timestamps } from './_shared.js';
import { restaurants } from './restaurants.js';
import { users } from './users.js';

/**
 * A person who has ordered, identified by phone number. No account or password
 * is required — the row is created on first checkout.
 *
 * This table is platform-level, so the same person ordering from two
 * restaurants is one row. Restaurants never read it directly; they read their
 * own `restaurant_customers` aggregate instead, which is what keeps one
 * restaurant from seeing another's customer base.
 */
export const customers = mysqlTable(
  'customers',
  {
    id: pk(),
    phone: varchar('phone', { length: 20 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 190 }),
    /** Reserved for when customer accounts land; null for every guest order. */
    userId: fk('user_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('uq_customers_phone').on(t.phone), index('idx_customers_user').on(t.userId)],
);

/**
 * The per-tenant view of a customer: how often they have ordered from *this*
 * restaurant and how much they have spent. Maintained inside the order
 * transaction, so it is always consistent with `orders`.
 *
 * This is what powers repeat-customer reporting and loyalty discounts without
 * making a restaurant scan the orders table.
 */
export const restaurantCustomers = mysqlTable(
  'restaurant_customers',
  {
    id: pk(),
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    customerId: fk('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    orderCount: int('order_count').notNull().default(0),
    /** Lifetime value: sum of `orders.total` for DELIVERED orders. */
    totalSpent: money('total_spent').notNull().default('0.00'),
    cancelledCount: int('cancelled_count').notNull().default(0),
    firstOrderAt: timestamp('first_order_at'),
    lastOrderAt: timestamp('last_order_at'),
    /** Lets a restaurant refuse a specific abusive customer. */
    isBlocked: int('is_blocked').notNull().default(0),
    notes: varchar('notes', { length: 500 }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('uq_restaurant_customers').on(t.restaurantId, t.customerId),
    index('idx_restaurant_customers_repeat').on(t.restaurantId, t.orderCount),
    index('idx_restaurant_customers_recent').on(t.restaurantId, t.lastOrderAt),
  ],
);

/** Saved delivery addresses, so a returning customer can reuse a pin. */
export const customerAddresses = mysqlTable(
  'customer_addresses',
  {
    id: pk(),
    customerId: fk('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 60 }),
    address: varchar('address', { length: 255 }).notNull(),
    landmark: varchar('landmark', { length: 160 }),
    latitude: coordinate('latitude').notNull(),
    longitude: coordinate('longitude').notNull(),
    isDefault: int('is_default').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('idx_customer_addresses_customer').on(t.customerId)],
);

export const customersRelations = relations(customers, ({ many }) => ({
  addresses: many(customerAddresses),
  restaurantLinks: many(restaurantCustomers),
}));

export const restaurantCustomersRelations = relations(restaurantCustomers, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantCustomers.restaurantId],
    references: [restaurants.id],
  }),
  customer: one(customers, {
    fields: [restaurantCustomers.customerId],
    references: [customers.id],
  }),
}));

export const customerAddressesRelations = relations(customerAddresses, ({ one }) => ({
  customer: one(customers, {
    fields: [customerAddresses.customerId],
    references: [customers.id],
  }),
}));

export type CustomerRow = typeof customers.$inferSelect;
export type RestaurantCustomerRow = typeof restaurantCustomers.$inferSelect;
