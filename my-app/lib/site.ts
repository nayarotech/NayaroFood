import { cache } from 'react';
import type { ChromeContent, HomeContent } from '@nayaro/shared';
import { API_URL } from '@/lib/api';

export interface SiteContent {
  home: HomeContent;
  chrome: ChromeContent;
  footerPages: { slug: string; title: string }[];
}

/**
 * Site content for the current request. `cache` dedupes the header, footer
 * and homepage reading it in one render; a short revalidate keeps every page
 * from hitting the API while still showing admin edits within seconds.
 */
export const getSite = cache(async (): Promise<SiteContent | null> => {
  try {
    const response = await fetch(`${API_URL}/public/site`, { next: { revalidate: 15, tags: ['site'] } });
    if (!response.ok) return null;
    return ((await response.json()) as { data: SiteContent }).data;
  } catch {
    // The site must still render if the API is briefly down.
    return null;
  }
});
