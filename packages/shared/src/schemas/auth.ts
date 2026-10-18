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

/** Customers sign in with their phone or email; staff with their email. */
export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone number.').max(190),
  password: z.string().min(1, 'Enter your password.'),
  /** Extends refresh-token lifetime; never changes access-token lifetime. */
  rememberMe: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Customer sign-up happens in three steps — the email is proven before
 * anything else is asked for:
 *   1. startSignupSchema      email → a code is emailed
 *   2. verifySignupSchema     email + code → a short-lived signup token
 *   3. completeSignupSchema   token + details → the account
 * The role is fixed to CUSTOMER server-side; nothing here can make an account
 * staff or admin.
 */
export const startSignupSchema = z.object({ email: emailSchema });

export const completeSignupSchema = z
  .object({
    /** Proof from step 2 that the email was verified. */
    signupToken: z.string().min(20).max(2000),
    name: z.string().trim().min(2, 'Enter your name.').max(120),
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { error: 'Please accept the terms to continue.' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
export type CompleteSignupInput = z.infer<typeof completeSignupSchema>;

/** A 6-digit (configurable) code from an email. Spaces and dashes are forgiven. */
export const emailCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => /^\d{4,8}$/.test(v), 'Enter the code from the email.');

/** Step 2 of sign-up: prove the email is yours. */
export const verifySignupSchema = z.object({ email: emailSchema, code: emailCodeSchema });
export type VerifySignupInput = z.infer<typeof verifySignupSchema>;

/** Ask for another code (sign-up or password reset). */
export const resendCodeSchema = z.object({ email: emailSchema });

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    code: emailCodeSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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
