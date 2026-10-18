import type { RestaurantRole, StaffPermission, UserRole } from '@nayaro/shared';

/** What a verified access token tells us about the caller. */
export interface AuthContext {
  userId: number;
  /** Null for riders, who sign in by phone. */
  email: string | null;
  role: UserRole;
  /** Bumped on password change; a stale token is rejected. */
  tokenVersion: number;
}

/**
 * A resolved tenant. Produced only by `requireRestaurant`, only from the
 * caller's `restaurant_users` membership — never from a request parameter.
 */
export interface TenantContext {
  restaurantId: number;
  restaurantRole: RestaurantRole | null;
  /** Effective permissions: everything for the owner and Super Admin, nothing for riders. */
  permissions: readonly StaffPermission[];
  isOwner: boolean;
  /** True when a Super Admin is acting on a tenant they are not a member of. */
  viaSuperAdmin: boolean;
}

/** A signed-in customer, resolved by `requireCustomer`. */
export interface CustomerContext {
  customerId: number;
  name: string;
  phone: string;
  email: string | null;
}
