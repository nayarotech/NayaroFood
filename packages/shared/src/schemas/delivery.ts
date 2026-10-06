import { z } from 'zod';
import { distanceKmSchema, idSchema, latLngSchema, moneyAmountSchema } from './common.js';

/**
 * Delivery zone write schemas. Range sanity (max > min) is checked here;
 * cross-zone overlap is checked in the service layer against the restaurant's
 * full saved set — see `validateZoneSet`.
 */
const zoneBody = z.object({
  name: z.string().trim().max(80).optional(),
  minDistanceKm: distanceKmSchema,
  maxDistanceKm: distanceKmSchema,
  /** Major units; 0 means free delivery in this band. */
  deliveryFee: moneyAmountSchema,
  isActive: z.boolean().default(true),
});

const hasValidRange = <T extends { minDistanceKm: number; maxDistanceKm: number }>(v: T) =>
  v.maxDistanceKm > v.minDistanceKm;

export const createDeliveryZoneSchema = zoneBody.refine(hasValidRange, {
  error: 'Maximum distance must be greater than minimum distance.',
  path: ['maxDistanceKm'],
});
export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;

export const updateDeliveryZoneSchema = zoneBody.partial().refine(
  (v) =>
    v.minDistanceKm === undefined || v.maxDistanceKm === undefined
      ? true
      : v.maxDistanceKm > v.minDistanceKm,
  { error: 'Maximum distance must be greater than minimum distance.', path: ['maxDistanceKm'] },
);
export type UpdateDeliveryZoneInput = z.infer<typeof updateDeliveryZoneSchema>;

/** Replace a restaurant's whole zone set in one atomic call — what the editor uses. */
export const replaceDeliveryZonesSchema = z.object({
  zones: z
    .array(zoneBody.extend({ id: idSchema.optional() }).refine(hasValidRange, {
      error: 'Maximum distance must be greater than minimum distance.',
      path: ['maxDistanceKm'],
    }))
    .max(20, 'A restaurant can have at most 20 delivery zones.'),
});
export type ReplaceDeliveryZonesInput = z.infer<typeof replaceDeliveryZonesSchema>;

/**
 * Advisory quote for the cart screen. The client sends coordinates only — never
 * a distance and never a fee. Checkout recomputes all of it regardless.
 */
export const deliveryQuoteSchema = z.object({
  restaurantId: idSchema,
  destination: latLngSchema,
});
export type DeliveryQuoteInput = z.infer<typeof deliveryQuoteSchema>;
