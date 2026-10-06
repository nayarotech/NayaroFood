'use server';

import { updateTag } from 'next/cache';
import { getSession } from '@/lib/session';

/**
 * Called by the site editors after a save, so the public site shows the
 * change on the very next request instead of after the cache window.
 * The API already authorised the save; this re-checks so nobody else can
 * churn the cache.
 */
export async function refreshSiteContent(): Promise<void> {
  const session = await getSession();
  if (session?.user.role !== 'SUPER_ADMIN') return;
  updateTag('site');
}
