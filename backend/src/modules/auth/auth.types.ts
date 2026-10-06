import type { RestaurantRole, UserRole } from '@nayaro/shared';

/** What a verified access token tells us about the caller. */
export interface AuthContext {
  userId: number;
  email: string;
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
  /** True when a Super Admin is acting on a tenant they are not a member of. */
  viaSuperAdmin: boolean;
}
