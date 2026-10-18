import { cache } from 'react';
import { cookies } from 'next/headers';
import { API_URL } from '@/lib/api';
import type { StaffPermission, UserRole } from '@/lib/roles';

export type { StaffPermission, UserRole } from '@/lib/roles';
export { can, homeFor } from '@/lib/roles';

/**
 * Server-side session lookup.
 *
 * The access token is an httpOnly cookie, so a server component cannot read
 * the user out of it directly — it forwards the cookie to the API and lets the
 * API decide. That keeps one authority on what a session means.
 */


export interface SessionUser {
  id: number;
  /** Riders may have no email. */
  email: string | null;
  name: string;
  phone: string | null;
  role: UserRole;
}

export interface SessionRestaurant {
  id: number;
  name: string;
  slug: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  statusReason?: string | null;
  onboardingStep: string;
  /** The signed-in person's role in this restaurant, and what they may do. */
  role: 'OWNER' | 'MANAGER' | 'STAFF' | 'RIDER';
  permissions: StaffPermission[];
}

export interface SessionCustomer {
  id: number;
  name: string;
  phone: string;
  email: string | null;
}

export interface Session {
  user: SessionUser;
  restaurant: SessionRestaurant | null;
  customer: SessionCustomer | null;
}

/** Cached per request: the header, layout and page share one lookup. */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const token = store.get('access_token');
  if (!token) return null;

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { cookie: `access_token=${token.value}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: Session };
    return payload.data ?? null;
  } catch {
    // The API being down must not crash every page that renders a header.
    return null;
  }
});
