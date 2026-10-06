import Link from 'next/link';
import type { Route } from 'next';
import { fetchPaged, param, toQuery } from '@/lib/dashboard-api';
import type { PageMeta } from '@/lib/api';
import { formatDateTime, formatDistance, formatMoney } from '@/lib/format';
import { EmptyState, PageHeader } from '@/components/admin/page-header';
import { Pagination } from '@/components/pagination';
import {
  OPEN_ORDER_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  OrderStatusBadge,
  type OrderStatus,
} from '@/components/order-status-badge';

export const metadata = { title: 'Orders · Admin' };
export const dynamic = 'force-dynamic';

interface Row {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  distanceKm: number;
  totalMinor: number;
  itemCount: number;
  restaurantId: number;
  restaurantName: string;
}

const PER_PAGE = 25;

/** "open" is a shortcut for every status that still needs someone to act. */
function statusFilter(value: string | undefined): string | undefined {
  if (value === 'open') return OPEN_ORDER_STATUSES.join(',');
  return ORDER_STATUSES.includes(value as OrderStatus) ? value : undefined;
}

const isoDate = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

export default async function AdminOrdersPage({ searchParams }: PageProps<'/admin/orders'>) {
  const query = await searchParams;
  const status = param(query.status);
  const restaurantId = Number(param(query.restaurantId)) || undefined;
  const search = param(query.q)?.trim() || undefined;
  const from = isoDate(param(query.from));
  const to = isoDate(param(query.to));
  const sort = param(query.sort) ?? 'newest';
  const page = Math.max(1, Number(param(query.page)) || 1);

  const [result, restaurants] = await Promise.all([
    fetchPaged<Row, PageMeta & { gmvMinor: number }>(
      `/admin/orders${toQuery({
        status: statusFilter(status),
        restaurantId,
        search,
        from,
        to,
        sort,
        page,
        perPage: PER_PAGE,
      })}`,
    ),
    fetchPaged<{ id: number; name: string }>('/admin/restaurants?perPage=100&sort=name'),
  ]);

  const filtered = Boolean(status || restaurantId || search || from || to);
  const restaurantName = restaurants?.items.find((r) => r.id === restaurantId)?.name;

  const quick = (label: string, value?: string) => {
    const active = (status ?? '') === (value ?? '');
    return (
      <Link
        key={label}
        href={`/admin/orders${toQuery({ status: value, restaurantId, q: search, from, to })}` as Route}
        className={`rounded-ny-pill px-3 py-1.5 text-sm transition-colors ${
          active ? 'bg-accent font-semibold text-on-accent' : 'border border-line bg-surface text-ink-muted hover:border-accent-border'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        description={
          restaurantName
            ? `Full order history for ${restaurantName}.`
            : 'Every order placed on the platform, across all restaurants.'
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {quick('All')}
        {quick('Needs action', 'open')}
        {quick('Pending', 'PENDING')}
        {quick('Delivered', 'DELIVERED')}
        {quick('Cancelled', 'CANCELLED')}
        {quick('Rejected', 'REJECTED')}
      </div>

      <form action="/admin/orders" className="mb-4 grid gap-2 rounded-ny-card border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto_auto_auto]">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Order #, customer, phone, restaurant"
          aria-label="Search orders"
          className="rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <select name="restaurantId" defaultValue={restaurantId ?? ''} aria-label="Restaurant"
          className="rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none">
          <option value="">All restaurants</option>
          {restaurants?.items.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ''} aria-label="Status"
          className="rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none">
          <option value="">Any status</option>
          <option value="open">Needs action</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink-label">
          From
          <input type="date" name="from" defaultValue={from} className="rounded-ny border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-label">
          To
          <input type="date" name="to" defaultValue={to} className="rounded-ny border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none" />
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover">
            Filter
          </button>
          {filtered && (
            <Link href="/admin/orders" className="text-sm text-ink-muted hover:text-ink">Clear</Link>
          )}
        </div>
      </form>

      {!result ? (
        <EmptyState>Couldn&rsquo;t load orders.</EmptyState>
      ) : result.items.length === 0 ? (
        <EmptyState>{filtered ? 'No orders match these filters.' : 'No orders have been placed yet.'}</EmptyState>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-muted tabular-nums">
            <span className="font-semibold text-ink">{result.meta.total.toLocaleString('en-IN')}</span> orders ·{' '}
            <span className="font-semibold text-ink">{formatMoney(result.meta.gmvMinor)}</span> delivered value
          </p>
          <div className="overflow-x-auto rounded-ny-card border border-line bg-surface shadow-[var(--ny-shadow-card)]">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-xs text-ink-label">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Placed</th>
                  <th className="px-4 py-2.5 font-medium">Restaurant</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {result.items.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-surface-muted/60">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${order.id}` as Route} className="font-semibold tabular-nums hover:text-accent-label">
                        #{order.orderNumber}
                      </Link>
                      <p className="text-[11px] text-ink-label">{order.itemCount} items · {formatDistance(order.distanceKm)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">{formatDateTime(order.placedAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/restaurants/${order.restaurantId}` as Route} className="hover:text-accent-label">
                        {order.restaurantName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p>{order.customerName}</p>
                      <p className="font-mono text-[11px] text-ink-label">{order.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3"><OrderStatusBadge status={order.status} /></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(order.totalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            basePath="/admin/orders"
            params={{ status, restaurantId: restaurantId ? String(restaurantId) : undefined, q: search, from, to, sort: param(query.sort) }}
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
