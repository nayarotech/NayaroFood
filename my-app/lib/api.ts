/**
 * Thin client for the Nayaro API.
 *
 * Every response is unwrapped from the `{ data }` / `{ error }` envelope the
 * backend uses, so callers deal in plain values and thrown `ApiError`s.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string> | undefined;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface Envelope<T> {
  data?: T;
  meta?: PageMeta;
  error?: { code: string; message: string; fields?: Record<string, string> };
}

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/**
 * Rotate the session using the refresh cookie. Single-flight: when several
 * requests discover an expired access token at once, they share one refresh
 * rather than racing — a second rotation of the same refresh token would be
 * treated as replay and revoke the whole session.
 */
let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** 401 codes that mean "the access token lapsed", as opposed to a bad password. */
const EXPIRED_CODES = new Set(['UNAUTHORIZED', 'TOKEN_INVALID', 'TOKEN_STALE']);

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<Envelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      // Session cookies are httpOnly and set by the API.
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    // A network-level failure, not an API response — say so plainly rather
    // than letting an opaque TypeError surface in the UI.
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Is the API running?');
  }

  const payload = (await response.json().catch(() => ({}))) as Envelope<T>;

  // The access cookie lives 15 minutes; a dashboard stays open for hours.
  // Refresh once and replay, so an idle tab's next click just works.
  if (
    response.status === 401 &&
    !retried &&
    !path.startsWith('/auth/') &&
    EXPIRED_CODES.has(payload.error?.code ?? 'UNAUTHORIZED') &&
    typeof window !== 'undefined' &&
    (await refreshSession())
  ) {
    return request<T>(path, init, true);
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'UNKNOWN',
      payload.error?.message ?? 'Something went wrong.',
      payload.error?.fields,
    );
  }

  return payload;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await request<T>(path, { method: 'GET', ...init });
  return data as T;
}

export async function apiGetPaged<T>(
  path: string,
  init?: RequestInit,
): Promise<{ items: T[]; meta: PageMeta | undefined }> {
  const payload = await request<T[]>(path, { method: 'GET', ...init });
  return { items: payload.data ?? [], meta: payload.meta };
}

export async function apiPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const { data } = await request<T>(path, { method: 'POST', body: JSON.stringify(body), ...init });
  return data as T;
}

export async function apiPatch<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const { data } = await request<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...init });
  return data as T;
}

export async function apiPut<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const { data } = await request<T>(path, { method: 'PUT', body: JSON.stringify(body), ...init });
  return data as T;
}

export async function apiDelete(path: string, init?: RequestInit): Promise<void> {
  await request(path, { method: 'DELETE', ...init });
}

/**
 * Upload an image. Sent as multipart, so the JSON Content-Type default above
 * must not be set — the browser adds the multipart boundary itself.
 */
export async function apiUpload(
  file: File,
  kind: 'logo' | 'cover' | 'item' | 'site',
  retried = false,
): Promise<{ url: string }> {
  // Site-content images belong to the platform, not to a restaurant.
  const endpoint = kind === 'site' ? '/admin/site/uploads' : `/restaurant/uploads?kind=${kind}`;
  const body = new FormData();
  body.append('file', file);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      body,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Is the API running?');
  }
  const payload = (await response.json().catch(() => ({}))) as Envelope<{ url: string }>;
  if (response.status === 401 && !retried && (await refreshSession())) return apiUpload(file, kind, true);
  if (!response.ok || !payload.data) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'UNKNOWN',
      payload.error?.message ?? 'Upload failed.',
    );
  }
  return payload.data;
}
