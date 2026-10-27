import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
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

  // Ordering needs an account; come straight back here after signing in.
  const session = await getSession();
  if (!session) {
    const back = `/r/${slug}/checkout${lat && lng ? `?lat=${lat}&lng=${lng}` : ''}`;
    redirect(`/login?next=${encodeURIComponent(back)}` as Route);
  }
  if (session.user.role !== 'CUSTOMER' || !session.customer) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-xl font-bold">Use a customer account to order</h1>
        <p className="mt-2 text-sm text-ink-muted">
          You’re signed in with a restaurant or admin account, which can’t place orders. Sign out and sign in (or
          create an account) as a customer.
        </p>
      </div>
    );
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
    category.items.map((item) => ({ id: item.id, name: item.name, priceMinor: item.effectivePriceMinor, optionGroups: item.optionGroups })),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-16">
      <Link
        href={`/r/${slug}${lat && lng ? `?lat=${lat}&lng=${lng}` : ''}` as Route}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {restaurant.name}
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
          slots: restaurant.slots,
          timezone: restaurant.schedule.timezone,
        }}
        menu={menu}
        delivery={restaurant.delivery}
        location={lat && lng ? { lat: Number(lat), lng: Number(lng) } : null}
        customer={{ name: session.customer.name, phone: session.customer.phone }}
      />
    </div>
  );
}
