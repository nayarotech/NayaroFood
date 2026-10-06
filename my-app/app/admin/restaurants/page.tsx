import Link from 'next/link';
import type { Route } from 'next';
import { fetchAdmin, fetchPaged, param, toQuery } from '@/lib/dashboard-api';
import { formatDate } from '@/lib/format';
import { EmptyState, PageHeader } from '@/components/admin/page-header';
import { Pagination } from '@/components/pagination';
import { RestaurantStatusPill, type RestaurantStatus } from '@/components/restaurant-status-pill';
import { RestaurantStatusActions } from '@/components/admin/restaurant-status-actions';

export const metadata = { title: 'Restaurants · Admin' };
export const dynamic = 'force-dynamic';

interface Row {
  id: number;
  slug: string;
  name: string;
  email: string | null;
  phone: string;
  address: string;
  status: RestaurantStatus;
  statusReason: string | null;
  hasLocation: boolean;
  createdAt: string;
  approvedAt: string | null;
  ownerEmail: string | null;
  totalOrders: number;
  score: number | null;
  pinnedPosition: number | null;
  orders30d: number | null;
}

interface Counts {
  restaurants: { total: number; active: number; pending: number; suspended: number; inactive: number };
}

const TABS: { status?: RestaurantStatus; label: string; count: (c: Counts['restaurants']) => number }[] = [
  { label: 'All', count: (c) => c.total },
  { status: 'PENDING', label: 'Pending review', count: (c) => c.pending },
  { status: 'ACTIVE', label: 'Verified', count: (c) => c.active },
  { status: 'INACTIVE', label: 'Deactivated', count: (c) => c.inactive },
  { status: 'SUSPENDED', label: 'Blocked', count: (c) => c.suspended },
];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'orders', label: 'Most orders' },
  { value: 'rank', label: 'Ranking' },
];

const PER_PAGE = 20;

export default async function AdminRestaurantsPage({ searchParams }: PageProps<'/admin/restaurants'>) {
  const query = await searchParams;
  const rawStatus = param(query.status);
  const status = TABS.some((tab) => tab.status === rawStatus) ? (rawStatus as RestaurantStatus) : undefined;
  const search = param(query.q)?.trim() || undefined;
  const sortParam = param(query.sort);
  const sort = SORTS.some((s) => s.value === sortParam)
    ? sortParam!
    : status === 'PENDING'
      ? 'oldest' // Fair queue: the longest-waiting application first.
      : 'newest';
  const page = Math.max(1, Number(param(query.page)) || 1);

  const [counts, result] = await Promise.all([
    fetchAdmin<Counts>('/admin/stats'),
    fetchPaged<Row>(`/admin/restaurants${toQuery({ status, search, sort, page, perPage: PER_PAGE })}`),
  ]);

  const tabHref = (tabStatus?: RestaurantStatus) =>
    `/admin/restaurants${toQuery({ status: tabStatus, q: search })}` as Route;

  return (
    <div>
      <PageHeader
        title="Restaurants"
        description="Verify new applications, and block or deactivate restaurants that break the rules."
      />

      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const active = tab.status === status;
          const count = counts ? tab.count(counts.restaurants) : null;
          return (
            <Link
              key={tab.label}
              href={tabHref(tab.status)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-1.5 rounded-ny-pill px-3.5 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-accent font-semibold text-on-accent'
                  : 'border border-line bg-surface text-ink-muted hover:border-accent-border hover:text-ink'
              }`}
            >
              {tab.label}
              {count !== null && (
                <span
                  className={`rounded-ny-pill px-1.5 text-[11px] font-bold tabular-nums ${
                    active
                      ? 'bg-white/25'
                      : tab.status === 'PENDING' && count > 0
                        ? 'bg-warning-soft text-warning'
                        : 'bg-surface-inset text-ink-muted'
                  }`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <form action="/admin/restaurants" className="mb-4 flex flex-wrap gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search name, email, phone"
          aria-label="Search restaurants"
          className="min-w-0 flex-1 rounded-ny border border-line bg-surface px-3.5 py-2 text-sm focus:border-accent focus:outline-none sm:max-w-xs"
        />
        <select
          name="sort"
          defaultValue={sort}
          aria-label="Sort"
          className="rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover">
          Apply
        </button>
        {(search || sortParam) && (
          <Link href={tabHref(status)} className="self-center text-sm text-ink-muted hover:text-ink">
            Clear
          </Link>
        )}
      </form>

      {!result ? (
        <EmptyState>Couldn&rsquo;t load restaurants.</EmptyState>
      ) : result.items.length === 0 ? (
        <EmptyState>{search ? `No restaurants match “${search}”.` : 'No restaurants in this view.'}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-ny-card border border-line bg-surface shadow-[var(--ny-shadow-card)]">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-xs text-ink-label">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Restaurant</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                  <th className="px-4 py-2.5 text-right font-medium">Score</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {result.items.map((row) => (
                  <tr key={row.id} className="align-top transition-colors hover:bg-surface-muted/60">
                    <td className="px-4 py-3">
                      <Link href={`/admin/restaurants/${row.id}` as Route} className="font-semibold hover:text-accent-label">
                        {row.name}
                      </Link>
                      <p className="text-xs text-ink-label">{row.ownerEmail ?? row.email ?? '—'} · {row.phone}</p>
                      {!row.hasLocation && <p className="mt-0.5 text-[11px] text-warning">No location set</p>}
                    </td>
                    <td className="px-4 py-3">
                      <RestaurantStatusPill status={row.status} admin />
                      {row.statusReason && (
                        <p className="mt-1 max-w-[200px] truncate text-[11px] text-ink-label" title={row.statusReason}>
                          {row.statusReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Link href={`/admin/orders?restaurantId=${row.id}` as Route} className="hover:text-accent-label">
                        {row.totalOrders.toLocaleString('en-IN')}
                      </Link>
                      <p className="text-[11px] text-ink-label">{row.orders30d ?? 0} in 30d</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {(row.score ?? 0).toFixed(1)}
                      {row.pinnedPosition !== null && (
                        <p className="font-sans text-[11px] text-accent-label">Pinned #{row.pinnedPosition}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <RestaurantStatusActions restaurantId={row.id} name={row.name} status={row.status} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            basePath="/admin/restaurants"
            params={{ status, q: search, sort: sortParam }}
            page={result.meta.page}
            totalPages={result.meta.totalPages}
            total={result.meta.total}
            perPage={result.meta.perPage}
          />
        </>
      )}
    </div>
  );
}
