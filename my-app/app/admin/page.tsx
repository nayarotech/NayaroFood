import Link from 'next/link';
import type { Route } from 'next';
import { fetchAdmin } from '@/lib/dashboard-api';
import { formatMoney, timeAgo } from '@/lib/format';
import { EmptyState, PageHeader, Panel, StatTile } from '@/components/admin/page-header';
import { OrdersChart, type DayPoint } from '@/components/admin/orders-chart';
import { OrderStatusBadge, type OrderStatus } from '@/components/order-status-badge';
import { RestaurantStatusActions } from '@/components/admin/restaurant-status-actions';

export const metadata = { title: 'Platform admin' };
export const dynamic = 'force-dynamic';

interface Stats {
  restaurants: { total: number; active: number; pending: number; suspended: number; inactive: number };
  orders: {
    allTime: number;
    allTimeGmvMinor: number;
    today: number;
    todayGmvMinor: number;
    last30: number;
    last30GmvMinor: number;
    open: number;
    pending: number;
    cancellationRate30: number | null;
  };
  customers: { total: number };
  series: DayPoint[];
  topRestaurants: { id: number; name: string; orders: number; gmvMinor: number }[];
  recentOrders: {
    id: number;
    orderNumber: string;
    status: OrderStatus;
    placedAt: string;
    customerName: string;
    totalMinor: number;
    restaurantId: number;
    restaurantName: string;
  }[];
  pendingApprovals: {
    id: number;
    name: string;
    email: string | null;
    phone: string;
    address: string;
    createdAt: string;
  }[];
}

const n = (value: number) => value.toLocaleString('en-IN');

export default async function AdminOverviewPage() {
  const stats = await fetchAdmin<Stats>('/admin/stats');

  if (!stats) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState>Couldn&rsquo;t load platform stats. Is the API running?</EmptyState>
      </>
    );
  }

  const { restaurants, orders } = stats;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Everything happening on Nayaro Food, live. Figures use Nepal time."
      />

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Orders today" value={n(orders.today)} hint={`${formatMoney(orders.todayGmvMinor)} delivered`} />
        <StatTile
          label="Open orders"
          value={n(orders.open)}
          hint={orders.pending > 0 ? `${orders.pending} waiting for a restaurant` : 'Nothing waiting'}
          tone={orders.pending > 0 ? 'warning' : 'default'}
        />
        <StatTile label="Orders, last 30 days" value={n(orders.last30)} hint={`${formatMoney(orders.last30GmvMinor)} delivered`} />
        <StatTile
          label="Cancel / reject rate (30d)"
          value={orders.cancellationRate30 === null ? '—' : `${orders.cancellationRate30}%`}
          hint="Of finished orders"
          tone={orders.cancellationRate30 !== null && orders.cancellationRate30 > 15 ? 'danger' : 'default'}
        />
        <StatTile label="Live restaurants" value={n(restaurants.active)} hint={`${n(restaurants.total)} registered`} tone="success" />
        <StatTile
          label="Awaiting verification"
          value={n(restaurants.pending)}
          tone={restaurants.pending > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label="Blocked · Deactivated"
          value={`${n(restaurants.suspended)} · ${n(restaurants.inactive)}`}
          tone={restaurants.suspended > 0 ? 'danger' : 'default'}
        />
        <StatTile label="Customers" value={n(stats.customers.total)} hint={`${n(orders.allTime)} orders all-time`} />
      </dl>

      <div className="mt-6 grid gap-5 *:min-w-0 xl:grid-cols-[1fr_360px]">
        <Panel
          title="Orders per day — last 14 days"
          action={
            <Link href="/admin/orders" className="text-xs font-semibold text-accent-label hover:underline">
              All orders →
            </Link>
          }
        >
          <OrdersChart data={stats.series} />
        </Panel>

        <Panel title="Top restaurants — 30 days" flush>
          {stats.topRestaurants.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">No orders in the last 30 days.</p>
          ) : (
            <ol className="divide-y divide-line-soft">
              {stats.topRestaurants.map((restaurant, index) => (
                <li key={restaurant.id}>
                  <Link
                    href={`/admin/restaurants/${restaurant.id}` as Route}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-ny bg-surface-inset font-mono text-xs text-ink-muted">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{restaurant.name}</span>
                    <span className="text-right text-xs text-ink-muted tabular-nums">
                      <span className="block font-semibold text-ink">{restaurant.orders} orders</span>
                      {formatMoney(restaurant.gmvMinor)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 *:min-w-0 xl:grid-cols-2">
        <Panel
          title={`Awaiting verification${restaurants.pending > 0 ? ` (${restaurants.pending})` : ''}`}
          action={
            <Link href="/admin/restaurants?status=PENDING" className="text-xs font-semibold text-accent-label hover:underline">
              Review all →
            </Link>
          }
          flush
        >
          {stats.pendingApprovals.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">No applications waiting. 🎉</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {stats.pendingApprovals.map((restaurant) => (
                <li key={restaurant.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                  <div className="min-w-[200px] flex-1">
                    <Link
                      href={`/admin/restaurants/${restaurant.id}` as Route}
                      className="block truncate text-sm font-semibold hover:text-accent-label"
                    >
                      {restaurant.name}
                    </Link>
                    <p className="truncate text-xs text-ink-label">
                      {restaurant.address} · applied {timeAgo(restaurant.createdAt)}
                    </p>
                  </div>
                  <RestaurantStatusActions restaurantId={restaurant.id} name={restaurant.name} status="PENDING" size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Latest orders"
          action={
            <Link href="/admin/orders" className="text-xs font-semibold text-accent-label hover:underline">
              Full history →
            </Link>
          }
          flush
        >
          {stats.recentOrders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {stats.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.id}` as Route}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-semibold tabular-nums">#{order.orderNumber}</span>{' '}
                        <span className="text-ink-muted">· {order.restaurantName}</span>
                      </p>
                      <p className="truncate text-xs text-ink-label">
                        {order.customerName} · {timeAgo(order.placedAt)}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatMoney(order.totalMinor)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
