import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { fetchAdmin } from '@/lib/dashboard-api';
import { formatDateTime, formatDistance, formatMoney } from '@/lib/format';
import { PageHeader, Panel } from '@/components/admin/page-header';
import { ORDER_STATUS_LABEL, OrderStatusBadge, type OrderStatus } from '@/components/order-status-badge';
import { AdminOrderActions } from '@/components/admin/admin-order-actions';

export const dynamic = 'force-dynamic';

interface OrderDetail {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  restaurant: { id: number; name: string; slug: string; phone: string };
  customer: { id: number; name: string; phone: string; email: string | null };
  delivery: { address: string; landmark: string | null; latitude: number; longitude: number; distanceKm: number };
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  paymentMethod: string;
  paymentStatus: string;
  note: string | null;
  cancelledReason: string | null;
  items: { id: number; name: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number; note: string | null }[];
  history: {
    id: number;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    changedByActor: string;
    note: string | null;
    createdAt: string;
    userName: string | null;
    userEmail: string | null;
  }[];
  notifications: { id: number; channel: string; status: string; recipient: string; error: string | null; createdAt: string }[];
}

const ACTOR: Record<string, string> = {
  CUSTOMER: 'Customer',
  RESTAURANT: 'Restaurant',
  SUPER_ADMIN: 'Nayaro admin',
  SYSTEM: 'System',
};

function minutesBetween(a: string, b: string): string {
  const minutes = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export async function generateMetadata({ params }: PageProps<'/admin/orders/[orderId]'>) {
  const { orderId } = await params;
  return { title: `Order ${orderId} · Admin` };
}

export default async function AdminOrderPage({ params }: PageProps<'/admin/orders/[orderId]'>) {
  const { orderId } = await params;
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const order = await fetchAdmin<OrderDetail>(`/admin/orders/${id}`);
  if (!order) notFound();

  return (
    <div>
      <Link href="/admin/orders" className="mb-3 inline-block text-sm text-ink-muted hover:text-accent-label">
        ← Orders
      </Link>

      <PageHeader
        title={`Order #${order.orderNumber}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <span>Placed {formatDateTime(order.placedAt)} at</span>
            <Link href={`/admin/restaurants/${order.restaurant.id}` as Route} className="font-medium text-accent-label hover:underline">
              {order.restaurant.name}
            </Link>
          </span>
        }
      />

      {order.cancelledReason && (
        <p className="mb-5 rounded-ny-card bg-danger-soft px-4 py-3 text-sm text-danger">
          <span className="font-semibold">{ORDER_STATUS_LABEL[order.status]}:</span> {order.cancelledReason}
        </p>
      )}

      <div className="grid gap-5 *:min-w-0 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Panel title="Items" flush>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line-soft">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-2.5">
                      <span className="font-medium tabular-nums">{item.quantity}×</span> {item.name}
                      {item.note && <p className="text-xs text-ink-label">“{item.note}”</p>}
                    </td>
                    <td className="px-5 py-2.5 text-right text-ink-muted tabular-nums">@ {formatMoney(item.unitPriceMinor)}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums">{formatMoney(item.lineTotalMinor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line text-sm">
                <tr>
                  <td colSpan={2} className="px-5 pt-3 text-ink-muted">Subtotal</td>
                  <td className="px-5 pt-3 text-right tabular-nums">{formatMoney(order.subtotalMinor)}</td>
                </tr>
                {order.discountMinor > 0 && (
                  <tr>
                    <td colSpan={2} className="px-5 text-ink-muted">Discount</td>
                    <td className="px-5 text-right tabular-nums">−{formatMoney(order.discountMinor)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={2} className="px-5 text-ink-muted">Delivery ({formatDistance(order.delivery.distanceKm)})</td>
                  <td className="px-5 text-right tabular-nums">{order.deliveryFeeMinor === 0 ? 'Free' : formatMoney(order.deliveryFeeMinor)}</td>
                </tr>
                <tr>
                  <td colSpan={2} className="px-5 pt-1 pb-3 font-semibold">Total · {order.paymentMethod === 'COD' ? 'Cash on delivery' : order.paymentMethod}</td>
                  <td className="px-5 pt-1 pb-3 text-right font-display text-lg font-bold tabular-nums">{formatMoney(order.totalMinor)}</td>
                </tr>
              </tfoot>
            </table>
            {order.note && (
              <p className="mx-5 mb-4 rounded-ny bg-surface-muted px-3 py-2 text-sm text-ink-muted">Customer note: {order.note}</p>
            )}
          </Panel>

          <Panel title="Status history">
            <ol className="relative space-y-4 border-l-2 border-line pl-5">
              {order.history.map((entry, index) => (
                <li key={entry.id} className="relative">
                  <span
                    aria-hidden
                    className={`absolute top-1 -left-[27px] size-3 rounded-full border-2 border-surface ${
                      index === order.history.length - 1 ? 'bg-accent' : 'bg-line-strong'
                    }`}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={entry.toStatus} />
                    <span className="text-xs text-ink-label">{formatDateTime(entry.createdAt)}</span>
                    {index > 0 && (
                      <span className="text-[11px] text-ink-label">
                        (+{minutesBetween(order.history[index - 1]!.createdAt, entry.createdAt)})
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    by {ACTOR[entry.changedByActor] ?? entry.changedByActor}
                    {entry.userName && <> — {entry.userName}</>}
                  </p>
                  {entry.note && entry.note !== 'Order placed' && <p className="mt-0.5 text-sm">“{entry.note}”</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Support actions">
            <AdminOrderActions orderId={order.id} orderNumber={order.orderNumber} status={order.status} />
          </Panel>

          <Panel title="Customer">
            <p className="font-medium">{order.customer.name}</p>
            <p className="text-sm">
              <a href={`tel:${order.customer.phone}`} className="font-mono text-ink-muted hover:text-accent-label">{order.customer.phone}</a>
            </p>
            {order.customer.email && <p className="text-sm text-ink-muted">{order.customer.email}</p>}
            <Link
              href={`/admin/orders?q=${encodeURIComponent(order.customer.phone)}` as Route}
              className="mt-2 inline-block text-xs font-semibold text-accent-label hover:underline"
            >
              All orders from this customer →
            </Link>
          </Panel>

          <Panel title="Delivery">
            <p className="text-sm">{order.delivery.address}</p>
            {order.delivery.landmark && <p className="text-sm text-ink-muted">Near {order.delivery.landmark}</p>}
            <p className="mt-1 text-xs text-ink-label">{formatDistance(order.delivery.distanceKm)} from the restaurant</p>
            <a
              href={`https://www.google.com/maps?q=${order.delivery.latitude},${order.delivery.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs font-semibold text-accent-label hover:underline"
            >
              Open pin in Google Maps ↗
            </a>
          </Panel>

          <Panel title="Restaurant">
            <Link href={`/admin/restaurants/${order.restaurant.id}` as Route} className="font-medium hover:text-accent-label">
              {order.restaurant.name}
            </Link>
            <p className="text-sm">
              <a href={`tel:${order.restaurant.phone}`} className="font-mono text-ink-muted hover:text-accent-label">{order.restaurant.phone}</a>
            </p>
          </Panel>

          {order.notifications.length > 0 && (
            <Panel title="Notifications sent">
              <ul className="space-y-2 text-sm">
                {order.notifications.map((n) => (
                  <li key={n.id}>
                    <span className="font-medium">{n.channel}</span> → <span className="font-mono text-xs">{n.recipient}</span>{' '}
                    <span className={n.status === 'SENT' ? 'text-success' : n.status === 'FAILED' ? 'text-danger' : 'text-ink-label'}>
                      {n.status.toLowerCase()}
                    </span>
                    {n.error && <p className="text-xs text-danger">{n.error}</p>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
