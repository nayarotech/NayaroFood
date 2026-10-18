import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiGet } from '@/lib/api';
import { UtensilsCrossed } from 'lucide-react';
import { RatingChip } from '@/components/stars';
import { formatDistance, formatMoney, formatPrepTime } from '@/lib/format';
import type { MenuItem, RestaurantDetail } from '@/lib/types';
import { AddToCart } from '@/components/order/add-to-cart';
import { CartSummary } from '@/components/order/cart-summary';
import { ChevronLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/r/[slug]'>) {
  const { slug } = await params;
  try {
    const restaurant = await apiGet<RestaurantDetail>(`/public/restaurants/${slug}`, {
      cache: 'no-store',
    });
    return { title: restaurant.name, description: restaurant.description ?? undefined };
  } catch {
    return { title: 'Restaurant' };
  }
}

export default async function RestaurantPage({ params, searchParams }: PageProps<'/r/[slug]'>) {
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

  const { delivery } = restaurant;
  const closed = !restaurant.isOpen || !restaurant.acceptsOrders;
  const itemCount = restaurant.menu.reduce((total, c) => total + c.items.length, 0);

  return (
    <div>
      {/* Banner */}
      {restaurant.coverUrl && (
        <div className="relative h-40 overflow-hidden border-b border-line bg-surface-inset sm:h-56">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={restaurant.coverUrl} alt="" className="size-full object-cover" />
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4">
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft aria-hidden className="size-4" /> All restaurants
        </Link>

        <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            {restaurant.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={restaurant.logoUrl}
                alt={`${restaurant.name} logo`}
                className="size-16 shrink-0 rounded-full border-2 border-surface object-cover shadow-[var(--ny-shadow-card)] sm:size-20"
              />
            )}
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-tight font-bold tracking-tight">
              {restaurant.name}
            </h1>
            {restaurant.description && (
              <p className="mt-2 max-w-xl text-[15px] text-ink-muted">{restaurant.description}</p>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-subtle">
              <RatingChip rating={restaurant.rating} />
              <span aria-hidden>·</span>
              <span>{restaurant.address}</span>
              <span aria-hidden>·</span>
              <span>{itemCount} dishes</span>
              {delivery !== null && (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{formatDistance(delivery.distanceKm)} away</span>
                </>
              )}
            </p>
          </div>
          </div>

          <span
            className={`rounded-ny-pill px-3 py-1 text-xs font-semibold tracking-wide ${
              closed ? 'bg-surface-muted text-ink-muted' : 'bg-success-soft text-success'
            }`}
          >
            {closed ? 'Closed' : 'Open now'}
          </span>
        </header>

        {/* What this costs you, stated once, prominently. */}
        {delivery !== null && (
          <div
            className={`mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ny-card border px-4 py-3 ${
              delivery.deliverable
                ? 'border-accent-border bg-accent-soft'
                : 'border-danger/30 bg-danger-soft'
            }`}
          >
            {delivery.deliverable ? (
              <>
                <span className="font-display text-lg font-bold text-accent-label">
                  {delivery.feeMinor === 0 ? 'Free delivery' : formatMoney(delivery.feeMinor)}
                </span>
                <span className="text-sm text-ink-muted">
                  to your location — you&rsquo;re in the {delivery.zone.minDistanceKm}–
                  {delivery.zone.maxDistanceKm} km band.
                </span>
              </>
            ) : (
              <span className="text-sm font-medium text-danger">
                {delivery.reason === 'NO_ZONES_CONFIGURED'
                  ? 'This restaurant hasn’t set up delivery yet.'
                  : `You’re ${formatDistance(delivery.distanceKm)} away — beyond their ${delivery.maxSupportedKm} km delivery range.`}
              </span>
            )}
          </div>
        )}

        <div className="mt-7 grid gap-8 pb-28 lg:grid-cols-[1fr_300px] lg:pb-14">
          <section>
            {/* Jump links, sticky under the header on long menus. */}
            {restaurant.menu.length > 1 && (
              <nav
                aria-label="Menu sections"
                className="sticky top-14 z-20 -mx-4 mb-5 overflow-x-auto border-b border-line bg-background/90 px-4 py-2.5 backdrop-blur-md"
              >
                <ul className="flex w-max gap-1.5">
                  {restaurant.menu.map((category) => (
                    <li key={category.id}>
                      <a
                        href={`#category-${category.id}`}
                        className="block rounded-ny-pill px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent-label"
                      >
                        {category.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {restaurant.menu.length === 0 ? (
              <p className="rounded-ny-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-ink-muted">
                This restaurant hasn&rsquo;t published a menu yet.
              </p>
            ) : (
              restaurant.menu.map((category) => (
                <section
                  key={category.id}
                  id={`category-${category.id}`}
                  className="mb-9 scroll-mt-28"
                >
                  <div className="mb-3 flex items-baseline gap-2.5">
                    <h2 className="font-display text-xl font-semibold tracking-tight">
                      {category.name}
                    </h2>
                    <span className="text-xs text-ink-label">{category.items.length}</span>
                  </div>

                  <ul className="grid gap-3 sm:grid-cols-2">
                    {category.items.map((item) => (
                      <MenuItemCard
                        key={item.id}
                        item={item}
                        restaurantId={restaurant.id}
                        closed={closed}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <CartSummary
              restaurantId={restaurant.id}
              slug={restaurant.slug}
              delivery={delivery}
              minOrderMinor={restaurant.minOrderMinor}
              closed={closed}
              locationQuery={lat && lng ? `?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}` : ''}
            />
            <div className="rounded-ny-card border border-line bg-surface p-4">
              <h2 className="font-display text-sm font-semibold tracking-tight">Delivery fees</h2>
              {restaurant.zones.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">This restaurant hasn’t set up delivery yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line-soft text-sm">
                  {restaurant.zones.map((zone) => {
                    const yours = delivery?.deliverable && delivery.zone.id === zone.id;
                    return (
                      <li key={zone.id} className={`flex justify-between py-1.5 ${yours ? 'font-medium text-ink' : 'text-ink-muted'}`}>
                        <span className="tabular-nums">
                          {zone.minDistanceKm}–{zone.maxDistanceKm} km{yours ? ' · you' : ''}
                        </span>
                        <span className={`tabular-nums ${zone.feeMinor === 0 ? 'text-success' : ''}`}>
                          {zone.feeMinor === 0 ? 'Free' : formatMoney(zone.feeMinor)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {restaurant.minOrderMinor > 0 && (
                <p className="mt-2 border-t border-line-soft pt-2 text-xs text-ink-muted">
                  Minimum order {formatMoney(restaurant.minOrderMinor)}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function MenuItemCard({
  item,
  restaurantId,
  closed,
}: {
  item: MenuItem;
  restaurantId: number;
  closed: boolean;
}) {
  const discounted =
    item.discountPriceMinor !== null && item.discountPriceMinor < item.priceMinor;
  const prep = formatPrepTime(item.prepTimeMinutes);

  return (
    <li className="flex gap-3 overflow-hidden rounded-ny-card border border-line bg-surface p-3 transition-colors hover:border-line-strong">
      <div className="size-20 shrink-0 overflow-hidden rounded-ny bg-surface-inset sm:size-24">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-ink-label">
            <UtensilsCrossed aria-hidden className="size-6" strokeWidth={1.25} />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] leading-snug font-medium">{item.name}</h3>
          {discounted && (
            <span className="shrink-0 rounded-ny-pill bg-success-soft px-1.5 py-0.5 text-[10px] font-bold text-success">
              SALE
            </span>
          )}
        </div>

        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-subtle">
            {item.description}
          </p>
        )}

        <div className="mt-auto flex items-baseline gap-2 pt-1.5">
          <span className="font-display font-semibold tabular-nums">
            {formatMoney(item.effectivePriceMinor)}
          </span>
          {discounted && (
            <span className="text-xs text-ink-label line-through tabular-nums">
              {formatMoney(item.priceMinor)}
            </span>
          )}
          {prep && <span className="text-xs text-ink-label">· {prep}</span>}
          <span className="ml-auto">
            <AddToCart
              restaurantId={restaurantId}
              item={{ id: item.id, name: item.name, priceMinor: item.effectivePriceMinor }}
              disabled={closed}
            />
          </span>
        </div>
      </div>
    </li>
  );
}
