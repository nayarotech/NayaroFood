import Link from 'next/link';
import type { Route } from 'next';
import { fetchPaged, param, toQuery } from '@/lib/dashboard-api';
import { formatDateTime } from '@/lib/format';
import { EmptyState, PageHeader } from '@/components/admin/page-header';
import { Pagination } from '@/components/pagination';
import { ACTION_FILTERS, describeAction } from '@/components/admin/audit-labels';

export const metadata = { title: 'Activity log · Admin' };
export const dynamic = 'force-dynamic';

interface Row {
  id: number;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: { reason?: string | null; from?: string; to?: string; orderNumber?: string } | null;
  ipAddress: string | null;
  createdAt: string;
  restaurantId: number | null;
  restaurantName: string | null;
  actorName: string | null;
  actorEmail: string | null;
}

const PER_PAGE = 30;

export default async function AdminActivityPage({ searchParams }: PageProps<'/admin/activity'>) {
  const query = await searchParams;
  const actionParam = param(query.action);
  const action = ACTION_FILTERS.some((f) => f.value === actionParam) ? actionParam : undefined;
  const page = Math.max(1, Number(param(query.page)) || 1);
  const result = await fetchPaged<Row>(`/admin/audit-logs${toQuery({ action, page, perPage: PER_PAGE })}`);

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="Every admin action on the platform — who did it, when, and why. Append-only."
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {ACTION_FILTERS.map((filter) => {
          const active = (action ?? '') === filter.value;
          return (
            <Link
              key={filter.label}
              href={`/admin/activity${toQuery({ action: filter.value })}` as Route}
              className={`rounded-ny-pill px-3 py-1.5 text-sm transition-colors ${
                active ? 'bg-accent font-semibold text-on-accent' : 'border border-line bg-surface text-ink-muted hover:border-accent-border'
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {!result ? (
        <EmptyState>Couldn&rsquo;t load the activity log.</EmptyState>
      ) : result.items.length === 0 ? (
        <EmptyState>No activity recorded yet.</EmptyState>
      ) : (
        <>
          <ol className="divide-y divide-line-soft rounded-ny-card border border-line bg-surface shadow-[var(--ny-shadow-card)]">
            {result.items.map((entry) => {
              const orderLink =
                entry.entityType === 'order' && entry.entityId ? (`/admin/orders/${entry.entityId}` as Route) : null;
              const customerLink =
                entry.entityType === 'customer' && entry.entityId ? (`/admin/customers/${entry.entityId}` as Route) : null;
              return (
                <li key={entry.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">{entry.actorName ?? entry.actorEmail ?? 'System'}</span>{' '}
                      <span className="text-ink-muted">{describeAction(entry.action).replace(/^./, (c) => c.toLowerCase())}</span>
                      {entry.restaurantId && entry.restaurantName && (
                        <>
                          {' '}
                          <Link href={`/admin/restaurants/${entry.restaurantId}` as Route} className="font-medium text-accent-label hover:underline">
                            {entry.restaurantName}
                          </Link>
                        </>
                      )}
                      {customerLink && (
                        <>
                          {' '}
                          <Link href={customerLink} className="font-medium text-accent-label hover:underline">
                            {(entry.metadata as { name?: string } | null)?.name ?? 'customer'}
                          </Link>
                        </>
                      )}
                      {orderLink && (
                        <>
                          {' '}·{' '}
                          <Link href={orderLink} className="font-medium text-accent-label hover:underline">
                            order #{entry.metadata?.orderNumber ?? entry.entityId}
                          </Link>
                        </>
                      )}
                    </p>
                    {entry.metadata?.from && entry.metadata?.to && (
                      <p className="mt-0.5 text-xs text-ink-label">
                        {entry.metadata.from.toLowerCase().replace(/_/g, ' ')} to {entry.metadata.to.toLowerCase().replace(/_/g, ' ')}
                      </p>
                    )}
                    {entry.metadata?.reason && <p className="mt-0.5 text-sm text-ink-muted">“{entry.metadata.reason}”</p>}
                  </div>
                  <p className="text-xs text-ink-label tabular-nums" title={entry.ipAddress ?? undefined}>
                    {formatDateTime(entry.createdAt)}
                  </p>
                </li>
              );
            })}
          </ol>
          <Pagination basePath="/admin/activity" params={{ action }} page={result.meta.page}
            totalPages={result.meta.totalPages} total={result.meta.total} perPage={result.meta.perPage} />
        </>
      )}
    </div>
  );
}
