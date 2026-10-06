import { cookies } from 'next/headers';
import { API_URL } from '@/lib/api';

/**
 * Server-side session lookup.
 *
 * The access token is an httpOnly cookie, so a server component cannot read
 * the user out of it directly — it forwards the cookie to the API and lets the
 * API decide. That keeps one authority on what a session means.
 */

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: 'SUPER_ADMIN' | 'RESTAURANT_ADMIN';
}

export interface SessionRestaurant {
  id: number;
  name: string;
  slug: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  statusReason?: string | null;
  onboardingStep: string;
}

export interface Session {
  user: SessionUser;
  restaurant: SessionRestaurant | null;
}

export async function getSession(): Promise<Session | null> {
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
}
