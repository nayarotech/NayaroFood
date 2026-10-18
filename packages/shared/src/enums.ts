/**
 * Platform-wide enums. These string values are persisted in MySQL ENUM columns,
 * so treat every value here as part of the database contract: add new members
 * freely, never rename or reorder existing ones without a migration.
 */

/** Platform-level role. Tenant-level permissions live in `RestaurantRole`. */
export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  RESTAURANT_ADMIN: 'RESTAURANT_ADMIN',
  /** Someone who orders food. Must be signed in to place an order. */
  CUSTOMER: 'CUSTOMER',
  /** Delivers one restaurant's orders. Created by that restaurant, not self-registered. */
  RIDER: 'RIDER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** A user's role *within* one restaurant, via the `restaurant_users` join table. */
export const RestaurantRole = {
  OWNER: 'OWNER',
  /** Runs the restaurant day to day, with exactly the permissions the owner grants. */
  MANAGER: 'MANAGER',
  /** Legacy; treated like MANAGER. */
  STAFF: 'STAFF',
  RIDER: 'RIDER',
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

/**
 * Why a restaurant flagged a customer. Remarks are factual incident reports
 * the platform uses to spot repeat problems — not public reviews.
 */
export const CustomerRemarkReason = {
  NOT_REACHABLE: 'NOT_REACHABLE',
  CANCELLED_LATE: 'CANCELLED_LATE',
  REFUSED_DELIVERY: 'REFUSED_DELIVERY',
  WRONG_ADDRESS: 'WRONG_ADDRESS',
  FAKE_ORDER: 'FAKE_ORDER',
  ABUSIVE: 'ABUSIVE',
  OTHER: 'OTHER',
} as const;
export type CustomerRemarkReason = (typeof CustomerRemarkReason)[keyof typeof CustomerRemarkReason];

export const CUSTOMER_REMARK_LABEL: Record<CustomerRemarkReason, string> = {
  NOT_REACHABLE: 'Didn’t answer the phone',
  CANCELLED_LATE: 'Cancelled at the last moment',
  REFUSED_DELIVERY: 'Refused the delivery',
  WRONG_ADDRESS: 'Wrong or fake address',
  FAKE_ORDER: 'Fake order',
  ABUSIVE: 'Abusive behaviour',
  OTHER: 'Other',
};

/**
 * What a manager may do, granted one by one by the restaurant owner. The
 * owner implicitly has all of them, plus managing the team itself.
 */
export const StaffPermission = {
  ORDERS: 'ORDERS',
  RIDERS: 'RIDERS',
  MENU: 'MENU',
  CUSTOMERS: 'CUSTOMERS',
  REVIEWS: 'REVIEWS',
  SETTINGS: 'SETTINGS',
} as const;
export type StaffPermission = (typeof StaffPermission)[keyof typeof StaffPermission];

export const STAFF_PERMISSION_INFO: Record<StaffPermission, { label: string; detail: string }> = {
  ORDERS: { label: 'Orders', detail: 'See incoming orders, accept or reject them, and move them along.' },
  RIDERS: { label: 'Riders & delivery', detail: 'Add riders and assign orders to them.' },
  MENU: { label: 'Menu', detail: 'Add and edit dishes, prices and photos.' },
  CUSTOMERS: { label: 'Customers', detail: 'See customers and report problem customers.' },
  REVIEWS: { label: 'Reviews', detail: 'Read customers’ ratings and comments.' },
  SETTINGS: { label: 'Settings', detail: 'Change opening status, delivery zones, profile and photos.' },
};
