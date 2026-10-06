import Link from 'next/link';
import type { Route } from 'next';
import { PageEditor } from '@/components/admin/site/page-editor';

export const metadata = { title: 'New page · Site content' };

export default function NewSitePage() {
  return (
    <div>
      <Link href={'/admin/site/pages' as Route} className="mb-3 inline-block text-sm text-ink-muted hover:text-accent-label">← All pages</Link>
      <PageEditor
        initial={{ slug: '', title: '', summary: '', body: '', showContactForm: false, isPublished: true, showInFooter: true, sortOrder: 10 }}
      />
    </div>
  );
}
