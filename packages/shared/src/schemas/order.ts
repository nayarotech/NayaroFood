import { z } from 'zod';
import { OrderStatus, PaymentMethod, enumValues } from '../enums.js';
import {
  idSchema,
  latitudeSchema,
  longitudeSchema,
  paginationSchema,
  phoneSchema,
  searchSchema,
} from './common.js';

/**
 * What a customer may send when placing an order.
 *
 * Deliberately absent: prices, line totals, subtotal, delivery fee, distance,
 * and the matched zone. Every one of those is derived server-side from the
 * database. A client that sends them will have them ignored.
 */
export const placeOrderItemSchema = z.object({
  foodItemId: idSchema,
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.').max(99),
  note: z.string().trim().max(200).optional(),
});
export type PlaceOrderItemInput = z.infer<typeof placeOrderItemSchema>;

export const placeOrderSchema = z.object({
  restaurantId: idSchema,
  items: z
    .array(placeOrderItemSchema)
    .min(1, 'Your cart is empty.')
    .max(50, 'Too many items in one order.'),
  /**
   * Ignored by the API: the name and phone come from the signed-in customer's
   * account. Kept optional so older clients don't fail validation.
   */
  customer: z
    .object({
      name: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(30).optional(),
      email: z.string().trim().max(190).optional(),
    })
    .optional(),
  delivery: z.object({
    address: z.string().trim().min(5, 'Enter your delivery address.').max(255),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    landmark: z.string().trim().max(160).optional(),
  }),
  paymentMethod: z.enum(enumValues(PaymentMethod)).default(PaymentMethod.COD),
  note: z.string().trim().max(500).optional(),
  /**
   * Client-generated UUID. Replaying the same key returns the original order
   * instead of creating a duplicate when a customer double-taps "Place order".
   */
  idempotencyKey: z.uuid().optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(enumValues(OrderStatus)),
  reason: z.string().trim().max(300).optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const orderListQuerySchema = paginationSchema.extend({
  status: z
    .union([z.enum(enumValues(OrderStatus)), z.array(z.enum(enumValues(OrderStatus)))])
    .optional(),
  search: searchSchema,
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  customerId: idSchema.optional(),
  sort: z.enum(['newest', 'oldest', 'total_high', 'total_low']).default('newest'),
});
export type OrderListQueryInput = z.infer<typeof orderListQuerySchema>;

/** Public order tracking: order number plus the phone that placed it. */
export const trackOrderSchema = z.object({
  orderNumber: z.string().trim().min(1).max(32),
  phone: phoneSchema,
});
export type TrackOrderInput = z.infer<typeof trackOrderSchema>;

/* ---------------- Customer tracking ---------------- */

/**
 * Tracking codes: "NY" + 8 characters from an alphabet without look-alikes
 * (no 0/O, 1/I/L), so a code read aloud over the phone survives.
 */
export const TRACKING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Accepts "ny-7k3q-f9tz", " NY7K3QF9TZ " … and stores "NY7K3QF9TZ". */
export function normaliseTrackingCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** "NY7K3QF9TZ" → "NY-7K3Q-F9TZ" for display. */
export function formatTrackingCode(code: string): string {
  const clean = normaliseTrackingCode(code);
  if (clean.length !== 10) return clean;
  return `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6)}`;
}

export const trackingCodeSchema = z
  .string()
  .trim()
  .max(24)
  .transform(normaliseTrackingCode)
  .refine((v) => /^NY[A-Z0-9]{8}$/.test(v), 'Enter the tracking code from your order, e.g. NY-7K3Q-F9TZ.');

export const trackingCodeParamSchema = z.object({ code: trackingCodeSchema });

export const customerCancelSchema = z.object({
  /**
   * Not needed when the signed-in customer owns the order. Otherwise it must
   * match the phone the order was placed with — the tracking code alone is
   * shareable, so it is never enough to cancel.
   */
  phone: phoneSchema.optional(),
  reason: z.string().trim().max(300).optional(),
});
export type CustomerCancelInput = z.infer<typeof customerCancelSchema>;
