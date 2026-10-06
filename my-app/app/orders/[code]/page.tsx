import { notFound } from 'next/navigation';
import { ApiError, apiGet } from '@/lib/api';
import { OrderTracker, type TrackedOrder } from '@/components/order/order-tracker';

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
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-16">
      <OrderTracker initial={order} justPlaced={justPlaced} />
    </div>
  );
}
