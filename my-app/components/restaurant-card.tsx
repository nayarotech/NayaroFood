import Link from 'next/link';
import { FoodArt } from '@/components/food-art';
import { formatDeliveryFee, formatDistance } from '@/lib/format';
import type { RestaurantSummary } from '@/lib/types';

/**
 * One restaurant in the browse grid.
 *
 * The delivery fee is the loudest element on the card by design: it is the
 * number a customer is usually surprised by at checkout elsewhere, so it is
 * settled here, before they invest any time in a menu.
 */
export function RestaurantCard({
  restaurant,
  featured = false,
  locationQuery = '',
}: {
  restaurant: RestaurantSummary;
  featured?: boolean;
  /** Carries the chosen delivery location through to the restaurant page. */
  locationQuery?: string;
}) {
  const { delivery, deliveryFrom } = restaurant;
  const closed = !restaurant.isOpen || !restaurant.acceptsOrders;
  const tooFar = delivery !== null && !delivery.deliverable;
  const dimmed = closed || tooFar;

  return (
    <Link
      href={`/r/${restaurant.slug}${locationQuery}`}
      className={`group relative flex flex-col overflow-hidden rounded-ny-card border border-line bg-surface transition-all duration-200 hover:-translate-y-1 hover:border-accent-border hover:shadow-[var(--ny-shadow-card-hover)] ${
        featured ? 'sm:col-span-2 sm:flex-row' : ''
      }`}
    >
      <div
        className={`relative shrink-0 overflow-hidden bg-surface-inset ${
          featured ? 'h-40 sm:h-auto sm:w-2/5' : 'h-36'
        }`}
      >
        {restaurant.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.coverUrl}
            alt=""
            loading="lazy"
            className={`size-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              dimmed ? 'opacity-55 grayscale' : ''
            }`}
          />
        ) : (
          <FoodArt
            seed={restaurant.slug}
            category={restaurant.categories[0] ?? restaurant.name}
            className={`size-full transition-transform duration-300 group-hover:scale-105 ${
              dimmed ? 'opacity-55 grayscale' : ''
            }`}
          />
        )}

        {restaurant.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.logoUrl}
            alt=""
            loading="lazy"
            className="absolute bottom-2.5 left-2.5 size-11 rounded-full border-2 border-white object-cover shadow-[var(--ny-shadow-card)]"
          />
        )}

        {/* The fee, stated up front. */}
        <div className="absolute top-2.5 left-2.5">
          {delivery === null ? (
            deliveryFrom && (
              <Chip tone="glass">
                from {formatDeliveryFee(deliveryFrom.minFeeMinor)} delivery
              </Chip>
            )
          ) : delivery.deliverable ? (
            <Chip tone={delivery.feeMinor === 0 ? 'free' : 'accent'}>
              {delivery.feeMinor === 0 ? 'FREE delivery' : `${formatDeliveryFee(delivery.feeMinor)} delivery`}
            </Chip>
          ) : (
            <Chip tone="danger">Out of range</Chip>
          )}
        </div>

        {closed && (
          <div className="absolute inset-0 grid place-items-center bg-[var(--ny-background)]/55">
            <span className="rounded-ny-pill bg-surface px-3 py-1 text-xs font-semibold tracking-wide text-ink uppercase">
              Closed
            </span>
          </div>
        )}
      </div>

      <div className={`flex flex-1 flex-col gap-1.5 p-4 ${featured ? 'justify-center sm:p-6' : ''}`}>
        <h3
          className={`font-display leading-tight font-semibold tracking-tight ${
            featured ? 'text-xl' : 'text-base'
          }`}
        >
          {restaurant.name}
        </h3>

        {featured && restaurant.description && (
          <p className="line-clamp-2 text-sm text-ink-muted">{restaurant.description}</p>
        )}

        {restaurant.categories.length > 0 && (
          <p className="truncate text-[13px] text-ink-subtle">
            {restaurant.categories.slice(0, 4).join(' · ')}
          </p>
        )}

        <div className={`flex items-center gap-2 pt-2 text-xs text-ink-label ${featured ? '' : 'mt-auto'}`}>
          {delivery !== null ? (
            <span className="font-mono tabular-nums">{formatDistance(delivery.distanceKm)}</span>
          ) : (
            <span className="truncate">{restaurant.address}</span>
          )}
          {deliveryFrom && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">delivers to {deliveryFrom.maxSupportedKm} km</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: 'accent' | 'free' | 'danger' | 'glass';
  children: React.ReactNode;
}) {
  const tones = {
    accent: 'bg-accent text-on-accent',
    free: 'bg-success text-white',
    danger: 'bg-danger text-white',
    glass: 'bg-surface/90 text-ink-muted backdrop-blur-sm',
  } as const;

  return (
    <span
      className={`inline-block rounded-ny-pill px-2.5 py-1 text-[11px] font-semibold tracking-wide shadow-[var(--ny-shadow-card)] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
