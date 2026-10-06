import { relations } from 'drizzle-orm';
import { index, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { distanceKm, fk, money, pk, timestamps } from './_shared.js';
import { restaurants } from './restaurants.js';

/**
 * Per-restaurant distance bands. Each restaurant sets its own delivery policy;
 * there is no platform-wide radius.
 *
 * Interval semantics are half-open: [min_distance_km, max_distance_km).
 * Overlap is rejected by the service layer via `validateZoneSet` before write,
 * because MySQL cannot express "no two rows may overlap" as a constraint.
 */
export const deliveryZones = mysqlTable(
  'delivery_zones',
  {
    id: pk(),
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }),
    minDistanceKm: distanceKm('min_distance_km').notNull(),
    maxDistanceKm: distanceKm('max_distance_km').notNull(),
    /** 0.00 means free delivery within this band. */
    deliveryFee: money('delivery_fee').notNull().default('0.00'),
    isActive: int('is_active').notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    index('idx_delivery_zones_lookup').on(t.restaurantId, t.isActive, t.minDistanceKm),
  ],
);

export const deliveryZonesRelations = relations(deliveryZones, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [deliveryZones.restaurantId],
    references: [restaurants.id],
  }),
}));

export type DeliveryZoneRow = typeof deliveryZones.$inferSelect;
export type NewDeliveryZoneRow = typeof deliveryZones.$inferInsert;
