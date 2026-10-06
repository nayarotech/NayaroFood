import { z } from 'zod';
import { RestaurantStatus, enumValues } from '../enums.js';
import {
  emailSchema,
  idSchema,
  imageUrlSchema,
  latitudeSchema,
  longitudeSchema,
  paginationSchema,
  phoneSchema,
  searchSchema,
} from './common.js';

export const updateRestaurantProfileSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  logoUrl: imageUrlSchema.nullable().optional(),
  coverUrl: imageUrlSchema.nullable().optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.nullable().optional(),
  address: z.string().trim().min(5).max(255).optional(),
});
export type UpdateRestaurantProfileInput = z.infer<typeof updateRestaurantProfileSchema>;

/** The map picker writes here. This becomes the origin for every distance calculation. */
export const updateRestaurantLocationSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  address: z.string().trim().min(5).max(255).optional(),
});
export type UpdateRestaurantLocationInput = z.infer<typeof updateRestaurantLocationSchema>;

export const updateRestaurantSettingsSchema = z.object({
  currency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().max(64).optional(),
  minOrderAmount: z.coerce.number().min(0).max(999_999).optional(),
  defaultPrepTimeMinutes: z.coerce.number().int().min(0).max(360).optional(),
  /** Master switch: when false the restaurant is listed but cannot take orders. */
  acceptsOrders: z.boolean().optional(),
  orderNumberPrefix: z.string().trim().max(8).optional(),
});
export type UpdateRestaurantSettingsInput = z.infer<typeof updateRestaurantSettingsSchema>;

/* ---------------- Super Admin ---------------- */

export const adminRestaurantListQuerySchema = paginationSchema.extend({
  search: searchSchema,
  status: z.enum(enumValues(RestaurantStatus)).optional(),
  sort: z.enum(['rank', 'newest', 'oldest', 'name']).default('newest'),
});
export type AdminRestaurantListQueryInput = z.infer<typeof adminRestaurantListQuerySchema>;

/**
 * Taking a restaurant off the platform always needs a reason: the owner is
 * shown it, and the audit log keeps it.
 */
export const adminUpdateRestaurantStatusSchema = z
  .object({
    status: z.enum(enumValues(RestaurantStatus)),
    reason: z.string().trim().max(300).optional(),
  })
  .refine(
    (v) =>
      !(v.status === RestaurantStatus.SUSPENDED || v.status === RestaurantStatus.INACTIVE) ||
      Boolean(v.reason && v.reason.length >= 3),
    { error: 'Give a reason (at least 3 characters).', path: ['reason'] },
  );
export type AdminUpdateRestaurantStatusInput = z.infer<
  typeof adminUpdateRestaurantStatusSchema
>;

/* ---------------- Public browse ---------------- */

export const publicRestaurantListQuerySchema = paginationSchema.extend({
  search: searchSchema,
  /** When supplied, results are annotated with distance and deliverability. */
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  sort: z.enum(['relevance', 'distance', 'name']).default('relevance'),
});
export type PublicRestaurantListQueryInput = z.infer<
  typeof publicRestaurantListQuerySchema
>;

export const restaurantIdParamSchema = z.object({ restaurantId: idSchema });
