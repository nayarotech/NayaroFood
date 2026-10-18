import Link from 'next/link';
import type { Route } from 'next';
import { PageEditor } from '@/components/admin/site/page-editor';
import { ChevronLeft } from 'lucide-react';

export const metadata = { title: 'New page · Site content' };

export default function NewSitePage() {
  return (
    <div>
      <Link href={'/admin/site/pages' as Route} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-accent-label"><ChevronLeft aria-hidden className="size-4" /> All pages</Link>
      <PageEditor
        initial={{ slug: '', title: '', summary: '', body: '', showContactForm: false, isPublished: true, showInFooter: true, sortOrder: 10 }}
      />
    </div>
  );
}
