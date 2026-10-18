import { z } from 'zod';
import { CustomerRemarkReason, enumValues } from '../enums.js';
import { emailSchema, idSchema, paginationSchema, searchSchema } from './common.js';

/** A restaurant's incident report about a customer. */
export const createRemarkSchema = z.object({
  reason: z.enum(enumValues(CustomerRemarkReason)),
  note: z.string().trim().max(500).default(''),
  /** The order it happened on, when there is one. Must belong to the restaurant. */
  orderId: idSchema.optional(),
});
export type CreateRemarkInput = z.infer<typeof createRemarkSchema>;

/** Super Admin decision on a customer. Blocking always needs a reason. */
export const setCustomerBlockSchema = z
  .object({
    blocked: z.boolean(),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((v) => !v.blocked || Boolean(v.reason && v.reason.length >= 3), {
    error: 'Give a reason for blocking (at least 3 characters).',
    path: ['reason'],
  });
export type SetCustomerBlockInput = z.infer<typeof setCustomerBlockSchema>;

export const adminCustomerListSchema = paginationSchema.extend({
  search: searchSchema,
  filter: z.enum(['all', 'reported', 'blocked']).default('all'),
});

export const updateCustomerProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: emailSchema.optional(),
});
export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>;
