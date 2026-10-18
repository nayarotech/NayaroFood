import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Server-rendered pager. Keeps every other filter in the URL, so a paged,
 * filtered view is shareable and survives a refresh.
 */
export function Pagination({
  basePath,
  params,
  page,
  totalPages,
  total,
  perPage,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
}) {
  if (total === 0) return null;

  const href = (target: number): Route => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    if (target > 1) search.set('page', String(target));
    const text = search.toString();
    return `${basePath}${text ? `?${text}` : ''}` as Route;
  };

  const first = (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);

  const linkClass =
    'inline-flex items-center gap-1 rounded-ny border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink';
  const disabledClass =
    'inline-flex items-center gap-1 rounded-ny border border-line-soft px-3 py-1.5 text-sm text-ink-label opacity-50';

  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-label tabular-nums">
        {first.toLocaleString('en-IN')}–{last.toLocaleString('en-IN')} of{' '}
        {total.toLocaleString('en-IN')}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkClass} rel="prev">
            <ChevronLeft aria-hidden className="size-4" /> Previous
          </Link>
        ) : (
          <span className={disabledClass}><ChevronLeft aria-hidden className="size-4" /> Previous</span>
        )}
        <span className="text-sm text-ink-muted tabular-nums">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={href(page + 1)} className={linkClass} rel="next">
            Next <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <span className={disabledClass}>Next <ChevronRight aria-hidden className="size-4" /></span>
        )}
      </div>
    </nav>
  );
}
