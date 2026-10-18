import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { fetchAdmin } from '@/lib/dashboard-api';
import { formatDate, formatDateTime, formatMoney, timeAgo } from '@/lib/format';
import { PageHeader, Panel, StatTile } from '@/components/admin/page-header';
import { OrderStatusBadge, type OrderStatus } from '@/components/order-status-badge';
import { remarkLabel } from '@/lib/remarks';
import { Stars } from '@/components/stars';
import { CustomerBlockControl } from '@/components/admin/customer-block-control';

export const dynamic = 'force-dynamic';

interface Detail {
  customer: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    hasAccount: boolean;
    isBlocked: boolean;
    blockedReason: string | null;
    blockedAt: string | null;
    createdAt: string;
    lastLoginAt: string | null;
  };
  remarks: {
    id: number;
    reason: string;
    note: string;
    createdAt: string;
    restaurantId: number;
    restaurantName: string;
    reportedBy: string | null;
    reporterRole: string | null;
  }[];
  orders: { id: number; orderNumber: string; status: OrderStatus; placedAt: string; totalMinor: number; cancelledReason: string | null; restaurantName: string }[];
  reviews: { id: number; rating: number; comment: string; createdAt: string; restaurantName: string }[];
}

export async function generateMetadata({ params }: PageProps<'/admin/customers/[customerId]'>) {
  const detail = await fetchAdmin<Detail>(`/admin/customers/${Number((await params).customerId)}`);
  return { title: `${detail?.customer.name ?? 'Customer'} · Admin` };
}

export default async function AdminCustomerPage({ params }: PageProps<'/admin/customers/[customerId]'>) {
  const id = Number((await params).customerId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const detail = await fetchAdmin<Detail>(`/admin/customers/${id}`);
  if (!detail) notFound();
  const { customer, remarks, orders, reviews } = detail;
  const cancelled = orders.filter((o) => o.status === 'CANCELLED' || o.status === 'REJECTED').length;
  const reportingRestaurants = new Set(remarks.map((r) => r.restaurantId)).size;

  return (
    <div className="max-w-5xl">
      <Link href="/admin/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="size-4" /> Customers
      </Link>
      <PageHeader
        title={customer.name}
        description={
          <span>
            {customer.phone}
            {customer.email && ` · ${customer.email}`} · joined {formatDate(customer.createdAt)}
            {customer.hasAccount ? ` · last sign-in ${customer.lastLoginAt ? timeAgo(customer.lastLoginAt) : 'never'}` : ' · guest (no account)'}
          </span>
        }
      />

      <CustomerBlockControl customerId={customer.id} name={customer.name} blocked={customer.isBlocked}
        blockedReason={customer.blockedReason} blockedAt={customer.blockedAt} />

      <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Reports" value={String(remarks.length)} hint={`from ${reportingRestaurants} restaurant${reportingRestaurants === 1 ? '' : 's'}`} tone={remarks.length > 0 ? 'danger' : 'default'} />
        <StatTile label="Orders (latest 20)" value={String(orders.length)} />
        <StatTile label="Cancelled / rejected" value={String(cancelled)} tone={cancelled > 0 ? 'warning' : 'default'} />
        <StatTile label="Reviews written" value={String(reviews.length)} />
      </dl>

      <div className="mt-5 grid gap-5 *:min-w-0 lg:grid-cols-2">
        <Panel title="Reports from restaurants & riders" flush>
          {remarks.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">No reports.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {remarks.map((remark) => (
                <li key={remark.id} className="px-5 py-3">
                  <p className="text-sm font-medium">{remarkLabel(remark.reason)}</p>
                  {remark.note && <p className="mt-0.5 text-sm text-ink-muted">“{remark.note}”</p>}
                  <p className="mt-1 text-xs text-ink-label">
                    <Link href={`/admin/restaurants/${remark.restaurantId}` as Route} className="hover:text-accent-label">{remark.restaurantName}</Link>
                    {remark.reportedBy && ` · ${remark.reportedBy}${remark.reporterRole === 'RIDER' ? ' (rider)' : ''}`}
                    {' · '}{formatDateTime(remark.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent orders" flush>
          {orders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">No orders.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link href={`/admin/orders/${order.id}` as Route} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm"><span className="font-medium">#{order.orderNumber}</span> · {order.restaurantName}</p>
                      <p className="truncate text-xs text-ink-label">{formatDateTime(order.placedAt)}{order.cancelledReason ? ` · ${order.cancelledReason}` : ''}</p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                    <span className="w-20 text-right text-sm tabular-nums">{formatMoney(order.totalMinor)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {reviews.length > 0 && (
        <div className="mt-5">
          <Panel title="Reviews they wrote" flush>
            <ul className="divide-y divide-line-soft">
              {reviews.map((review) => (
                <li key={review.id} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Stars value={review.rating} />
                    <span className="text-sm">{review.restaurantName}</span>
                    <span className="text-xs text-ink-label">{formatDate(review.createdAt)}</span>
                  </div>
                  {review.comment && <p className="mt-1 text-sm text-ink-muted">{review.comment}</p>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}
