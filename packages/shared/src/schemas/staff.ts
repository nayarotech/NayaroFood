import { z } from 'zod';
import { StaffPermission, enumValues } from '../enums.js';
import { emailSchema, idSchema, passwordSchema, phoneSchema } from './common.js';

const permissionsSchema = z.array(z.enum(enumValues(StaffPermission))).max(10);

/** The owner adds a manager or a rider. Riders get no permissions — only their deliveries. */
export const createStaffSchema = z.object({
  role: z.enum(['MANAGER', 'RIDER']),
  name: z.string().trim().min(2, 'Enter their name.').max(120),
  phone: phoneSchema,
  /** Optional: riders often sign in with their phone only. */
  email: emailSchema.or(z.literal('')).optional(),
  password: passwordSchema,
  permissions: permissionsSchema.default([]),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  permissions: permissionsSchema.optional(),
  isActive: z.boolean().optional(),
  /** Reset their password; they should change it after signing in. */
  password: passwordSchema.optional(),
});
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const assignRiderSchema = z.object({
  /** Null un-assigns. */
  riderId: idSchema.nullable(),
});
export type AssignRiderInput = z.infer<typeof assignRiderSchema>;

export const riderStatusSchema = z.object({
  status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
  /** Required when the delivery failed. */
  reason: z.string().trim().max(300).optional(),
});
export type RiderStatusInput = z.infer<typeof riderStatusSchema>;

export const deliveryNoteSchema = z.object({
  note: z.string().trim().max(500),
});

/** A customer's review of a delivered order. The comment is private to the restaurant. */
export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Choose a rating.').max(5),
  comment: z.string().trim().max(1000).default(''),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
