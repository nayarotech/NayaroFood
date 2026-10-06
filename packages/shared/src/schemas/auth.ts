import { z } from 'zod';
import { emailSchema, latitudeSchema, longitudeSchema, passwordSchema, phoneSchema } from './common.js';

/**
 * Self-service restaurant sign-up. Creates, in one transaction: a user, a
 * restaurant, the restaurant_users OWNER membership, and default settings.
 *
 * Note what is absent: no role field, and no restaurant_id. A client cannot
 * ask to be a SUPER_ADMIN or to join an existing tenant.
 */
export const registerRestaurantSchema = z
  .object({
    restaurantName: z.string().trim().min(2, 'Restaurant name is required.').max(150),
    ownerName: z.string().trim().min(2, 'Your name is required.').max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    phone: phoneSchema,
    /** Optional at sign-up — it has its own verification step in onboarding. */
    whatsappNumber: phoneSchema.optional(),
    address: z.string().trim().min(5, 'Enter the restaurant address.').max(255),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    description: z.string().trim().max(1000).optional(),
    acceptTerms: z.literal(true, { error: 'You must accept the terms to continue.' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
export type RegisterRestaurantInput = z.infer<typeof registerRestaurantSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
  /** Extends refresh-token lifetime; never changes access-token lifetime. */
  rememberMe: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    error: 'Choose a password different from your current one.',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
