import { notFound } from 'next/navigation';
import { ApiError, apiGet } from '@/lib/api';
import { OrderTracker, type TrackedOrder } from '@/components/order/order-tracker';
import { getSession } from '@/lib/session';
import { fetchTenant } from '@/lib/dashboard-api';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/orders/[code]'>) {
  const { code } = await params;
  return { title: `Order ${code.toUpperCase()}`, robots: { index: false } };
}

export default async function TrackedOrderPage({ params, searchParams }: PageProps<'/orders/[code]'>) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^NY[A-Z0-9]{8}$/.test(clean)) notFound();

  let order: TrackedOrder;
  try {
    order = await apiGet<TrackedOrder>(`/public/orders/code/${clean}`, { cache: 'no-store' });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const justPlaced = (await searchParams).placed === '1';

  // Only the customer who placed the order is offered the review form.
  const session = await getSession();
  const mine =
    session?.user.role === 'CUSTOMER'
      ? await fetchTenant<{ review: { rating: number; comment: string } | null }>(`/customer/orders/${clean}`)
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-16">
      <OrderTracker initial={order} justPlaced={justPlaced} isOwner={mine !== null} review={mine?.review ?? null} />
    </div>
  );
}
