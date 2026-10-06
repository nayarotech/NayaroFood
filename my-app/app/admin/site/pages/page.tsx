import Link from 'next/link';
import type { Route } from 'next';
import { fetchAdmin } from '@/lib/dashboard-api';
import { formatDateTime } from '@/lib/format';
import { EmptyState } from '@/components/admin/page-header';

export const metadata = { title: 'Pages · Site content' };
export const dynamic = 'force-dynamic';

interface PageRow {
  id: number;
  slug: string;
  title: string;
  summary: string;
  isPublished: boolean;
  showInFooter: boolean;
  showContactForm: boolean;
  updatedAt: string;
}

export default async function SitePagesList() {
  const pages = await fetchAdmin<PageRow[]>('/admin/site/pages');
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">About us, Privacy policy, Terms, Contact — and anything else you need.</p>
        <Link href={'/admin/site/pages/new' as Route}
          className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] hover:bg-accent-hover">
          + New page
        </Link>
      </div>
      {!pages ? (
        <EmptyState>Couldn&rsquo;t load pages.</EmptyState>
      ) : pages.length === 0 ? (
        <EmptyState>No pages yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-ny-card border border-line bg-surface shadow-[var(--ny-shadow-card)]">
          {pages.map((page) => (
            <li key={page.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <div className="min-w-[200px] flex-1">
                <Link href={`/admin/site/pages/${page.id}` as Route} className="font-semibold hover:text-accent-label">{page.title}</Link>
                <p className="text-xs text-ink-label">
                  <span className="font-mono">/{page.slug}</span> · updated {formatDateTime(page.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge on={page.isPublished} onLabel="Published" offLabel="Draft" />
                {page.showInFooter && <Badge on onLabel="In footer" />}
                {page.showContactForm && <Badge on onLabel="Contact form" />}
              </div>
              <div className="flex gap-2">
                {page.isPublished && (
                  <Link href={`/${page.slug}` as Route} target="_blank" className="rounded-ny border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-accent-border">
                    View ↗
                  </Link>
                )}
                <Link href={`/admin/site/pages/${page.id}` as Route} className="rounded-ny border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-accent-border hover:text-accent-label">
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Badge({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel?: string }) {
  return (
    <span className={`rounded-ny-pill px-2 py-0.5 text-[11px] font-semibold ${on ? 'bg-success-soft text-success' : 'bg-surface-inset text-ink-muted'}`}>
      {on ? onLabel : offLabel}
    </span>
  );
}
