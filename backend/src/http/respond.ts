import type { Response } from 'express';

/**
 * One response envelope for the whole API, so the frontend has a single shape
 * to unwrap: `{ data, meta? }` on success, `{ error: { code, message } }` on
 * failure (see the error handler).
 */

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data });
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ data });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function paginated<T>(
  res: Response,
  items: T[],
  meta: { page: number; perPage: number; total: number },
): Response {
  return res.status(200).json({
    data: items,
    meta: {
      ...meta,
      totalPages: Math.max(1, Math.ceil(meta.total / meta.perPage)),
    } satisfies PageMeta,
  });
}
