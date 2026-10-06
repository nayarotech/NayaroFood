import type { ChromeContent } from '@nayaro/shared';
import { fetchAdmin } from '@/lib/dashboard-api';
import { EmptyState } from '@/components/admin/page-header';
import { ChromeEditor } from '@/components/admin/site/chrome-editor';

export const metadata = { title: 'Header & footer · Site content' };
export const dynamic = 'force-dynamic';

export default async function FooterContentPage() {
  const [content, pages] = await Promise.all([
    fetchAdmin<{ chrome: ChromeContent }>('/admin/site/content'),
    fetchAdmin<{ slug: string; title: string; isPublished: boolean }[]>('/admin/site/pages'),
  ]);
  if (!content) return <EmptyState>Couldn&rsquo;t load the header and footer.</EmptyState>;
  return <ChromeEditor initial={content.chrome} pages={(pages ?? []).filter((p) => p.isPublished)} />;
}
