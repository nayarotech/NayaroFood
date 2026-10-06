import Link from 'next/link';
import type { Route } from 'next';
import { fetchPaged, param, toQuery } from '@/lib/dashboard-api';
import { formatDate, formatMoney, timeAgo } from '@/lib/format';
import { EmptyState, PageHeader } from '@/components/admin/page-header';
import { Pagination } from '@/components/pagination';

export const metadata = { title: 'Customers · Admin' };
export const dynamic = 'force-dynamic';

interface Row {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
  orders: number;
  delivered: number;
  cancelled: number;
  restaurants: number;
  spentMinor: number;
  lastOrderAt: string | null;
}

const PER_PAGE = 25;

export default async function AdminCustomersPage({ searchParams }: PageProps<'/admin/customers'>) {
  const query = await searchParams;
  const search = param(query.q)?.trim() || undefined;
  const page = Math.max(1, Number(param(query.page)) || 1);
  const result = await fetchPaged<Row>(`/admin/customers${toQuery({ search, page, perPage: PER_PAGE })}`);

  return (
    <div>
      <PageHeader title="Customers" description="Everyone who has ordered, across all restaurants. Identified by phone number." />

      <form action="/admin/customers" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search name or phone"
          aria-label="Search customers"
          className="min-w-0 flex-1 rounded-ny border border-line bg-surface px-3.5 py-2 text-sm focus:border-accent focus:outline-none sm:max-w-xs"
        />
        <button type="submit" className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover">
          Search
        </button>
      </form>

      {!result ? (
        <EmptyState>Couldn&rsquo;t load customers.</EmptyState>
      ) : result.items.length === 0 ? (
        <EmptyState>{search ? `No customers match “${search}”.` : 'No customers yet.'}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-ny-card border border-line bg-surface shadow-[var(--ny-shadow-card)]">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-xs text-ink-label">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cancelled</th>
                  <th className="px-4 py-2.5 text-right font-medium">Restaurants</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spent</th>
                  <th className="px-4 py-2.5 font-medium">Last order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {result.items.map((customer) => (
                  <tr key={customer.id} className="transition-colors hover:bg-surface-muted/60">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders?q=${encodeURIComponent(customer.phone)}` as Route}
                        className="font-medium hover:text-accent-label"
                      >
                        {customer.name}
                      </Link>
                      <p className="font-mono text-[11px] text-ink-label">{customer.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {customer.orders}
                      {customer.orders > 1 && <span className="ml-1 rounded-ny-pill bg-success-soft px-1.5 text-[10px] font-bold text-success">repeat</span>}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${customer.cancelled > 0 ? 'text-danger' : 'text-ink-muted'}`}>
                      {customer.cancelled}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{customer.restaurants}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatMoney(customer.spentMinor)}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted" title={formatDate(customer.lastOrderAt)}>
                      {timeAgo(customer.lastOrderAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination basePath="/admin/customers" params={{ q: search }} page={result.meta.page}
            totalPages={result.meta.totalPages} total={result.meta.total} perPage={result.meta.perPage} />
        </>
      )}
    </div>
  );
}
