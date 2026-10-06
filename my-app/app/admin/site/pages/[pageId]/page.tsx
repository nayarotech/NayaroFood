import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { fetchAdmin } from '@/lib/dashboard-api';
import { PageEditor, type EditablePage } from '@/components/admin/site/page-editor';

export const metadata = { title: 'Edit page · Site content' };
export const dynamic = 'force-dynamic';

export default async function EditSitePage({ params }: PageProps<'/admin/site/pages/[pageId]'>) {
  const id = Number((await params).pageId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const page = await fetchAdmin<EditablePage>(`/admin/site/pages/${id}`);
  if (!page) notFound();
  return (
    <div>
      <Link href={'/admin/site/pages' as Route} className="mb-3 inline-block text-sm text-ink-muted hover:text-accent-label">← All pages</Link>
      <PageEditor key={page.id} initial={page} />
    </div>
  );
}
