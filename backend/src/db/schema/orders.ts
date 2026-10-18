import { relations } from 'drizzle-orm';
import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { OrderStatus, PaymentMethod, PaymentStatus, enumValues } from '@nayaro/shared';
import { coordinate, distanceKm, fk, money, pk, timestamps } from './_shared.js';
import { customers } from './customers.js';
import { deliveryZones } from './delivery.js';
import { foodItems } from './menu.js';
import { restaurants } from './restaurants.js';
import { users } from './users.js';

/**
 * A placed order.
 *
 * Every monetary and distance column here is written from a server-side
 * calculation inside the order transaction. Nothing on this row originates
 * from client input except the customer's contact details, their chosen
 * coordinates, the item ids and the quantities.
 *
 * `distanceKm` and `deliveryZoneId` are stored rather than recomputed on read,
 * so there is a permanent record of why a given fee was charged even if the
 * restaurant later moves or rewrites its zones.
 */
export const orders = mysqlTable(
  'orders',
  {
    id: pk(),
    // RESTRICT everywhere on orders: financial history is never cascade-deleted.
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'restrict' }),
    /** Per-restaurant human-facing number, e.g. "1024". Unique within a tenant. */
    orderNumber: varchar('order_number', { length: 32 }).notNull(),
    /**
     * Platform-wide, unguessable tracking code given to the customer, e.g.
     * "NY7K3QF9TZ". Order numbers repeat across restaurants, so they cannot
     * identify an order on their own; this can, and works as a share link.
     */
    trackingCode: varchar('tracking_code', { length: 16 }),
    customerId: fk('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    /** Contact details snapshotted at order time, so later edits never rewrite history. */
    customerName: varchar('customer_name', { length: 120 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
    customerEmail: varchar('customer_email', { length: 190 }),

    deliveryAddress: varchar('delivery_address', { length: 255 }).notNull(),
    deliveryLandmark: varchar('delivery_landmark', { length: 160 }),
    deliveryLatitude: coordinate('delivery_latitude').notNull(),
    deliveryLongitude: coordinate('delivery_longitude').notNull(),

    /** Server-computed Haversine distance from the restaurant, at order time. */
    distanceKm: distanceKm('distance_km').notNull(),
    /** The zone that produced `deliveryFee`. SET NULL if the zone is later deleted. */
    deliveryZoneId: fk('delivery_zone_id').references(() => deliveryZones.id, {
      onDelete: 'set null',
    }),

    subtotal: money('subtotal').notNull(),
    discountTotal: money('discount_total').notNull().default('0.00'),
    deliveryFee: money('delivery_fee').notNull(),
    total: money('total').notNull(),

    status: mysqlEnum('status', enumValues(OrderStatus)).notNull().default(OrderStatus.PENDING),
    paymentMethod: mysqlEnum('payment_method', enumValues(PaymentMethod))
      .notNull()
      .default(PaymentMethod.COD),
    paymentStatus: mysqlEnum('payment_status', enumValues(PaymentStatus))
      .notNull()
      .default(PaymentStatus.UNPAID),

    note: varchar('note', { length: 500 }),
    cancelledReason: varchar('cancelled_reason', { length: 300 }),

    /** Deduplicates double-submits; unique per restaurant when present. */
    idempotencyKey: varchar('idempotency_key', { length: 64 }),

    /** The restaurant's rider delivering this order, if assigned. */
    riderUserId: fk('rider_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at'),
    pickedUpAt: timestamp('picked_up_at'),
    /** The rider's own note about the delivery ("left at gate", "no answer"). */
    deliveryNote: varchar('delivery_note', { length: 500 }),

    placedAt: timestamp('placed_at').defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at'),
    readyAt: timestamp('ready_at'),
    deliveredAt: timestamp('delivered_at'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('uq_orders_restaurant_number').on(t.restaurantId, t.orderNumber),
    uniqueIndex('uq_orders_tracking_code').on(t.trackingCode),
    uniqueIndex('uq_orders_idempotency').on(t.restaurantId, t.idempotencyKey),
    // Leading restaurant_id keeps every dashboard query inside one tenant's rows.
    index('idx_orders_dashboard').on(t.restaurantId, t.status, t.placedAt),
    index('idx_orders_restaurant_placed').on(t.restaurantId, t.placedAt),
    index('idx_orders_customer').on(t.customerId, t.placedAt),
    index('idx_orders_phone').on(t.customerPhone),
    index('idx_orders_platform_placed').on(t.placedAt),
    index('idx_orders_rider').on(t.riderUserId, t.status),
  ],
);

/**
 * Line items. `nameSnapshot` and `unitPrice` freeze what was actually sold at
 * what price, so renaming or repricing a menu item never rewrites past orders.
 */
export const orderItems = mysqlTable(
  'order_items',
  {
    id: pk(),
    orderId: fk('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** Denormalised tenant key: lets tenant-scoped reads filter without a join. */
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'restrict' }),
    /** Null once the menu item is hard-deleted; the snapshot below survives. */
    foodItemId: fk('food_item_id').references(() => foodItems.id, { onDelete: 'set null' }),
    nameSnapshot: varchar('name_snapshot', { length: 150 }).notNull(),
    unitPrice: money('unit_price').notNull(),
    quantity: int('quantity').notNull(),
    lineTotal: money('line_total').notNull(),
    note: varchar('note', { length: 200 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_order_items_order').on(t.orderId),
    index('idx_order_items_tenant').on(t.restaurantId, t.foodItemId),
  ],
);

/**
 * A customer's review of one delivered order. The rating is public only as a
 * restaurant average; the comment is private to the restaurant.
 */
export const orderReviews = mysqlTable(
  'order_reviews',
  {
    id: pk(),
    orderId: fk('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    customerId: fk('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    rating: int('rating').notNull(),
    comment: varchar('comment', { length: 1000 }).notNull().default(''),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('uq_order_reviews_order').on(t.orderId),
    index('idx_order_reviews_restaurant').on(t.restaurantId, t.createdAt),
  ],
);

export type OrderReviewRow = typeof orderReviews.$inferSelect;

/** Append-only audit of every status change, including who made it. */
export const orderStatusHistory = mysqlTable(
  'order_status_history',
  {
    id: pk(),
    orderId: fk('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'restrict' }),
    /** Null on the initial row, where the order comes into existence as PENDING. */
    fromStatus: mysqlEnum('from_status', enumValues(OrderStatus)),
    toStatus: mysqlEnum('to_status', enumValues(OrderStatus)).notNull(),
    /** Null when the actor was the customer or the system. */
    changedByUserId: fk('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    changedByActor: varchar('changed_by_actor', { length: 20 }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_order_status_history_order').on(t.orderId, t.createdAt),
    index('idx_order_status_history_tenant').on(t.restaurantId, t.createdAt),
  ],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  restaurant: one(restaurants, { fields: [orders.restaurantId], references: [restaurants.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  zone: one(deliveryZones, { fields: [orders.deliveryZoneId], references: [deliveryZones.id] }),
  items: many(orderItems),
  history: many(orderStatusHistory),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  foodItem: one(foodItems, { fields: [orderItems.foodItemId], references: [foodItems.id] }),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, { fields: [orderStatusHistory.orderId], references: [orders.id] }),
  changedBy: one(users, {
    fields: [orderStatusHistory.changedByUserId],
    references: [users.id],
  }),
}));

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type OrderStatusHistoryRow = typeof orderStatusHistory.$inferSelect;
