import { cookies } from 'next/headers';
import { API_URL, type PageMeta } from '@/lib/api';

/**
 * Server-side fetches that forward the httpOnly session cookie. They return
 * null rather than throwing so a page can render a useful empty state instead
 * of a crash when the API is unreachable.
 */

async function forward(path: string): Promise<Response | null> {
  const token = (await cookies()).get('access_token');
  if (!token) return null;
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { cookie: `access_token=${token.value}` },
      cache: 'no-store',
    });
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

export async function fetchTenant<T>(path: string): Promise<T | null> {
  const response = await forward(path);
  if (!response) return null;
  return ((await response.json()) as { data: T }).data;
}

/** Same as `fetchTenant`, keeping the pagination envelope. */
export async function fetchPaged<T, M extends PageMeta = PageMeta>(
  path: string,
): Promise<{ items: T[]; meta: M } | null> {
  const response = await forward(path);
  if (!response) return null;
  const payload = (await response.json()) as { data: T[]; meta: M };
  return { items: payload.data, meta: payload.meta };
}

/** The Super Admin surface uses the same cookie-forwarding fetch. */
export const fetchAdmin = fetchTenant;

/** Build a query string from defined, non-empty values only. */
export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** First value of a Next.js search param. */
export function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
