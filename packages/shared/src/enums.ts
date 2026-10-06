/**
 * Platform-wide enums. These string values are persisted in MySQL ENUM columns,
 * so treat every value here as part of the database contract: add new members
 * freely, never rename or reorder existing ones without a migration.
 */

/** Platform-level role. Tenant-level permissions live in `RestaurantRole`. */
export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  RESTAURANT_ADMIN: 'RESTAURANT_ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** A user's role *within* one restaurant, via the `restaurant_users` join table. */
export const RestaurantRole = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
} as const;
export type RestaurantRole = (typeof RestaurantRole)[keyof typeof RestaurantRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * Lifecycle of a tenant. Only ACTIVE restaurants are publicly listed and may
 * accept orders; PENDING is the state between sign-up and Super Admin approval.
 *
 * The two "off" states differ in what the owner keeps:
 *   SUSPENDED — blocked: hidden, no orders, and the owner is locked out of the dashboard.
 *   INACTIVE  — deactivated: hidden and no orders, but the owner can still sign in,
 *               see their history and fix whatever caused it.
 */
export const RestaurantStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  INACTIVE: 'INACTIVE',
} as const;
export type RestaurantStatus = (typeof RestaurantStatus)[keyof typeof RestaurantStatus];

/**
 * WhatsApp destination number state. Orders are only ever dispatched to a
 * number in the VERIFIED state — see `whatsapp_verifications`.
 */
export const WhatsAppStatus = {
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
} as const;
export type WhatsAppStatus = (typeof WhatsAppStatus)[keyof typeof WhatsAppStatus];

export const OrderStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Payment rails. Only COD is live today; the column exists so online payments slot in. */
export const PaymentMethod = {
  COD: 'COD',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const NotificationChannel = {
  WHATSAPP: 'WHATSAPP',
  SMS: 'SMS',
  EMAIL: 'EMAIL',
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;
export type NotificationStatus =
  (typeof NotificationStatus)[keyof typeof NotificationStatus];

/** Ordered steps of the restaurant onboarding wizard. */
export const OnboardingStep = {
  PROFILE: 'PROFILE',
  LOCATION: 'LOCATION',
  WHATSAPP: 'WHATSAPP',
  CATEGORIES: 'CATEGORIES',
  MENU: 'MENU',
  DELIVERY_ZONES: 'DELIVERY_ZONES',
  DONE: 'DONE',
} as const;
export type OnboardingStep = (typeof OnboardingStep)[keyof typeof OnboardingStep];

export const ONBOARDING_SEQUENCE: readonly OnboardingStep[] = [
  OnboardingStep.PROFILE,
  OnboardingStep.LOCATION,
  OnboardingStep.WHATSAPP,
  OnboardingStep.CATEGORIES,
  OnboardingStep.MENU,
  OnboardingStep.DELIVERY_ZONES,
  OnboardingStep.DONE,
] as const;

export const enumValues = <T extends Record<string, string>>(e: T) =>
  Object.values(e) as [T[keyof T], ...T[keyof T][]];
