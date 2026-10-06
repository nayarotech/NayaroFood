import Link from 'next/link';
import { fetchPaged, fetchTenant, param, toQuery } from '@/lib/dashboard-api';
import { OrderBoard, type DashboardOrder } from '@/components/order-board';
import { Pagination } from '@/components/pagination';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

interface Summary {
  today: {
    orders: number;
    revenueMinor: number;
    pending: number;
    preparing: number;
    ready: number;
    outForDelivery: number;
    delivered: number;
  };
  openOrders: number;
  pendingNow: number;
}

const OPEN = 'PENDING,ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY';
const HISTORY_PAGE_SIZE = 25;

export default async function OrdersPage({ searchParams }: PageProps<'/dashboard/orders'>) {
  const query = await searchParams;
  const view = param(query.view) === 'history' ? 'history' : 'open';
  const page = Math.max(1, Number(param(query.page)) || 1);
  const search = param(query.q)?.trim() || undefined;

  // The open queue is small and must be complete, oldest first so nothing is
  // forgotten; history is paged, newest first.
  const listPath =
    view === 'open'
      ? `/restaurant/orders?perPage=100&sort=oldest&${OPEN.split(',').map((s) => `status=${s}`).join('&')}`
      : `/restaurant/orders${toQuery({ perPage: HISTORY_PAGE_SIZE, page, search })}`;

  const [summary, orders] = await Promise.all([
    fetchTenant<Summary>('/restaurant/orders/summary'),
    fetchPaged<DashboardOrder>(listPath),
  ]);

  const tab = (active: boolean) =>
    `rounded-ny-pill px-3.5 py-1.5 text-sm transition-colors ${
      active
        ? 'bg-accent font-semibold text-on-accent'
        : 'border border-line bg-surface text-ink-muted hover:border-accent-border'
    }`;

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-xl font-bold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-ink-muted">New orders appear here the moment they&rsquo;re placed.</p>
      </header>

      {summary && (
        <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Today's orders" value={String(summary.today.orders)} />
          <Stat label="Today's sales" value={formatMoney(summary.today.revenueMinor)} />
          <Stat label="Waiting to accept" value={String(summary.pendingNow)} tone="warning" />
          <Stat label="In progress" value={String(summary.openOrders)} tone="accent" />
        </dl>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/dashboard/orders" className={tab(view === 'open')}>
          Needs action{summary && summary.openOrders > 0 ? ` (${summary.openOrders})` : ''}
        </Link>
        <Link href="/dashboard/orders?view=history" className={tab(view === 'history')}>
          All orders
        </Link>

        {view === 'history' && (
          <form action="/dashboard/orders" className="ml-auto flex gap-2">
            <input type="hidden" name="view" value="history" />
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Order #, name or phone"
              aria-label="Search orders"
              className="w-52 rounded-ny border border-line bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
            <button type="submit" className="rounded-ny border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted hover:border-accent-border">
              Search
            </button>
          </form>
        )}
      </div>

      {orders ? (
        <>
          <OrderBoard initial={orders.items} view={view} />
          {view === 'history' && (
            <Pagination
              basePath="/dashboard/orders"
              params={{ view: 'history', q: search }}
              page={orders.meta.page}
              totalPages={orders.meta.totalPages}
              total={orders.meta.total}
              perPage={orders.meta.perPage}
            />
          )}
        </>
      ) : (
        <p className="rounded-ny-card border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-muted">
          Couldn&rsquo;t load orders.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'warning';
}) {
  const tones = { default: 'text-ink', accent: 'text-accent', warning: 'text-warning' } as const;
  return (
    <div className="rounded-ny-card border border-line bg-surface p-4">
      <dt className="text-xs text-ink-label">{label}</dt>
      <dd className={`mt-0.5 font-display text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</dd>
    </div>
  );
}
