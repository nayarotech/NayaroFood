import Link from 'next/link';
import type { Route } from 'next';
import { fetchPaged, param, toQuery } from '@/lib/dashboard-api';
import { formatMoney, timeAgo } from '@/lib/format';
import { EmptyState, PageHeader } from '@/components/admin/page-header';
import { Pagination } from '@/components/pagination';

export const metadata = { title: 'Customers · Admin' };
export const dynamic = 'force-dynamic';

interface Row {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  hasAccount: boolean;
  isBlocked: boolean;
  reports: number;
  orders: number;
  cancelled: number;
  restaurants: number;
  spentMinor: number;
  lastOrderAt: string | null;
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'reported', label: 'Reported' },
  { value: 'blocked', label: 'Blocked' },
] as const;

export default async function AdminCustomersPage({ searchParams }: PageProps<'/admin/customers'>) {
  const query = await searchParams;
  const search = param(query.q)?.trim() || undefined;
  const filterParam = param(query.filter);
  const filter = FILTERS.some((f) => f.value === filterParam) ? filterParam! : 'all';
  const page = Math.max(1, Number(param(query.page)) || 1);
  const result = await fetchPaged<Row>(`/admin/customers${toQuery({ search, filter, page, perPage: 25 })}`);

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Everyone with an account or an order. Restaurants and riders report problem customers; block repeat offenders here."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link key={f.value} href={`/admin/customers${toQuery({ filter: f.value === 'all' ? undefined : f.value, q: search })}` as Route}
            aria-current={filter === f.value ? 'page' : undefined}
            className={`rounded-ny-pill px-3 py-1.5 text-sm ${filter === f.value ? 'bg-ink font-medium text-white' : 'border border-line bg-surface text-ink-muted hover:border-line-strong'}`}>
            {f.label}
          </Link>
        ))}
        <form action="/admin/customers" className="ml-auto flex gap-2">
          {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
          <input type="search" name="q" defaultValue={search} placeholder="Name, phone or email" aria-label="Search customers"
            className="w-56 rounded-ny border border-line bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none" />
          <button type="submit" className="rounded-ny border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:border-line-strong">Search</button>
        </form>
      </div>

      {!result ? (
        <EmptyState>Couldn&rsquo;t load customers.</EmptyState>
      ) : result.items.length === 0 ? (
        <EmptyState>{filter === 'reported' ? 'No reported customers.' : filter === 'blocked' ? 'No blocked customers.' : 'No customers yet.'}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-ny-card border border-line bg-surface">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-xs text-ink-label">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cancelled</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reports</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spent</th>
                  <th className="px-4 py-2.5 font-medium">Last order</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {result.items.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-muted/60">
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${c.id}` as Route} className="font-medium hover:text-accent-label">{c.name}</Link>
                      <p className="text-xs text-ink-label">{c.phone}{c.hasAccount ? '' : ' · guest (no account)'}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.orders}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${c.cancelled > 0 ? 'text-warning' : 'text-ink-muted'}`}>{c.cancelled}</td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums ${c.reports > 0 ? 'text-danger' : 'text-ink-label'}`}>{c.reports}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(c.spentMinor)}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{timeAgo(c.lastOrderAt)}</td>
                    <td className="px-4 py-3">
                      {c.isBlocked ? (
                        <span className="rounded-ny-pill bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">Blocked</span>
                      ) : (
                        <span className="text-xs text-ink-label">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination basePath="/admin/customers" params={{ q: search, filter: filter === 'all' ? undefined : filter }}
            page={result.meta.page} totalPages={result.meta.totalPages} total={result.meta.total} perPage={result.meta.perPage} />
        </>
      )}
    </div>
  );
}
