import type { HomeContent } from '@nayaro/shared';
import { fetchAdmin } from '@/lib/dashboard-api';
import { EmptyState } from '@/components/admin/page-header';
import { HomeEditor } from '@/components/admin/site/home-editor';

export const metadata = { title: 'Homepage · Site content' };
export const dynamic = 'force-dynamic';

export default async function HomeContentPage() {
  const content = await fetchAdmin<{ home: HomeContent }>('/admin/site/content');
  return content ? <HomeEditor initial={content.home} /> : <EmptyState>Couldn&rsquo;t load the homepage content.</EmptyState>;
}
