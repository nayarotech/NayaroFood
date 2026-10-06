import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, apiGet } from '@/lib/api';
import type { RestaurantDetail } from '@/lib/types';
import { CheckoutForm } from '@/components/order/checkout-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Checkout' };

export default async function CheckoutPage({ params, searchParams }: PageProps<'/r/[slug]/checkout'>) {
  const { slug } = await params;
  const query = await searchParams;
  const lat = typeof query.lat === 'string' ? query.lat : undefined;
  const lng = typeof query.lng === 'string' ? query.lng : undefined;

  const search = new URLSearchParams();
  if (lat && lng) {
    search.set('latitude', lat);
    search.set('longitude', lng);
  }

  let restaurant: RestaurantDetail;
  try {
    restaurant = await apiGet<RestaurantDetail>(
      `/public/restaurants/${slug}${search.toString() ? `?${search}` : ''}`,
      { cache: 'no-store' },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // The live menu, so the form can drop anything that sold out since it was added.
  const menu = restaurant.menu.flatMap((category) =>
    category.items.map((item) => ({ id: item.id, name: item.name, priceMinor: item.effectivePriceMinor })),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-16">
      <Link
        href={`/r/${slug}${lat && lng ? `?lat=${lat}&lng=${lng}` : ''}` as Route}
        className="text-sm text-ink-muted hover:text-accent-label"
      >
        ← Back to {restaurant.name}
      </Link>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Checkout</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Ordering from <span className="font-medium text-ink">{restaurant.name}</span> · Cash on delivery
      </p>

      <CheckoutForm
        restaurant={{
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          minOrderMinor: restaurant.minOrderMinor,
          closed: !restaurant.isOpen || !restaurant.acceptsOrders,
        }}
        menu={menu}
        delivery={restaurant.delivery}
        location={lat && lng ? { lat: Number(lat), lng: Number(lng) } : null}
      />
    </div>
  );
}
