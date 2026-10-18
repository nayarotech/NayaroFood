import Link from 'next/link';
import type { Route } from 'next';
import { fetchPaged, param, toQuery } from '@/lib/dashboard-api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { Pagination } from '@/components/pagination';
import { OrderStatusBadge, type OrderStatus } from '@/components/order-status-badge';
import { ReviewButton } from '@/components/account/review-dialog';

export const metadata = { title: 'My orders' };
export const dynamic = 'force-dynamic';

interface MyOrder {
  trackingCode: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;
  totalMinor: number;
  items: string;
  restaurantName: string;
  restaurantSlug: string;
  review: { rating: number; comment: string } | null;
}

const OPEN: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

export default async function MyOrdersPage({ searchParams }: PageProps<'/account'>) {
  const page = Math.max(1, Number(param((await searchParams).page)) || 1);
  const result = await fetchPaged<MyOrder>(`/customer/orders${toQuery({ page, perPage: 15 })}`);

  if (!result) {
    return <p className="rounded-ny-card border border-line bg-surface p-6 text-sm text-ink-muted">Couldn’t load your orders. Try again in a moment.</p>;
  }
  if (result.items.length === 0) {
    return (
      <div className="rounded-ny-card border border-line bg-surface p-8 text-center">
        <p className="font-medium">No orders yet</p>
        <p className="mt-1 text-sm text-ink-muted">Your orders will show up here.</p>
        <Link href="/" className="mt-4 inline-block rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover">
          Browse restaurants
        </Link>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-ny-card border border-line bg-surface">
        {result.items.map((order) => (
          <li key={order.trackingCode} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-5">
            <div className="min-w-0 flex-1 basis-60">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/r/${order.restaurantSlug}` as Route} className="font-semibold hover:text-accent-label">
                  {order.restaurantName}
                </Link>
                <OrderStatusBadge status={order.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-ink-muted">{order.items}</p>
              <p className="mt-0.5 text-xs text-ink-label">
                #{order.orderNumber} · {formatDateTime(order.placedAt)} · {formatMoney(order.totalMinor)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {order.status === 'DELIVERED' && (
                <ReviewButton code={order.trackingCode} restaurant={order.restaurantName} existing={order.review} />
              )}
              <Link
                href={`/orders/${order.trackingCode}` as Route}
                className={`rounded-ny px-3 py-1.5 text-sm font-medium ${
                  OPEN.includes(order.status)
                    ? 'bg-accent text-on-accent hover:bg-accent-hover'
                    : 'border border-line text-ink-hi hover:border-line-strong'
                }`}
              >
                {OPEN.includes(order.status) ? 'Track' : 'Details'}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <Pagination basePath="/account" params={{}} page={result.meta.page} totalPages={result.meta.totalPages}
        total={result.meta.total} perPage={result.meta.perPage} />
    </>
  );
}
