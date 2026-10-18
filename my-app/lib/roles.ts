/**
 * Role helpers safe to import anywhere (server or client). Session lookup
 * itself lives in lib/session.ts, which is server-only.
 */

export type UserRole = 'SUPER_ADMIN' | 'RESTAURANT_ADMIN' | 'CUSTOMER' | 'RIDER';
export type StaffPermission = 'ORDERS' | 'RIDERS' | 'MENU' | 'CUSTOMERS' | 'REVIEWS' | 'SETTINGS';

/** Where each kind of account lives after signing in. */
export function homeFor(role: UserRole | string): '/admin' | '/dashboard' | '/rider' | '/account' {
  if (role === 'SUPER_ADMIN') return '/admin';
  if (role === 'RIDER') return '/rider';
  if (role === 'CUSTOMER') return '/account';
  return '/dashboard';
}

export function can(
  session: { restaurant: { permissions?: readonly StaffPermission[] } | null } | null,
  permission: StaffPermission,
): boolean {
  return Boolean(session?.restaurant?.permissions?.includes(permission));
}
