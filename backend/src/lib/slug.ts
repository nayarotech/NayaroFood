import { slugify } from '@nayaro/shared';
import type { Executor } from '../db/client.js';

/**
 * Turn a name into a slug that is unique within the scope the caller defines,
 * appending -2, -3 … on collision.
 *
 * `exists` is supplied by the caller so the same helper works for globally
 * unique restaurant slugs and for per-tenant category and menu-item slugs.
 */
export async function uniqueSlug(
  source: string,
  exists: (candidate: string) => Promise<boolean>,
  fallback = 'item',
): Promise<string> {
  const base = slugify(source) || fallback;
  if (!(await exists(base))) return base;

  for (let suffix = 2; suffix < 200; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  // Astronomically unlikely; keeps the function total rather than looping forever.
  return `${base}-${Date.now().toString(36)}`;
}

export type { Executor };
