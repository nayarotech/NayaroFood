import Link from 'next/link';
import type { Route } from 'next';
import { Store } from 'lucide-react';
import { formatDistance, formatMoney } from '@/lib/format';
import { RatingChip } from '@/components/stars';
import type { RestaurantSummary } from '@/lib/types';

/** One restaurant in the browse grid: photo, name, rating, then what delivery costs you. */
export function RestaurantCard({
  restaurant,
  locationQuery = '',
}: {
  restaurant: RestaurantSummary;
  /** Kept for callers that still pass it; every card is the same size now. */
  featured?: boolean;
  /** Carries the chosen delivery location through to the restaurant page. */
  locationQuery?: string;
}) {
  const { delivery, deliveryFrom } = restaurant;
  const closed = !restaurant.isOpen || !restaurant.acceptsOrders;
  const tooFar = delivery !== null && !delivery.deliverable;

  const fee =
    delivery === null
      ? deliveryFrom
        ? deliveryFrom.minFeeMinor === 0
          ? { text: 'Free delivery nearby', tone: 'text-ink-muted' }
          : { text: `Delivery from ${formatMoney(deliveryFrom.minFeeMinor)}`, tone: 'text-ink-muted' }
        : null
      : delivery.deliverable
        ? delivery.feeMinor === 0
          ? { text: 'Free delivery', tone: 'text-success font-medium' }
          : { text: `${formatMoney(delivery.feeMinor)} delivery`, tone: 'text-ink-hi' }
        : { text: 'Doesn’t deliver to you', tone: 'text-danger' };

  return (
    <Link
      href={`/r/${restaurant.slug}${locationQuery}` as Route}
      className={`group flex flex-col overflow-hidden rounded-ny-card border border-line bg-surface transition-shadow hover:shadow-[var(--ny-shadow-card-hover)] ${
        tooFar ? 'opacity-70' : ''
      }`}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-inset">
        {restaurant.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.coverUrl}
            alt=""
            loading="lazy"
            className={`size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${closed ? 'grayscale' : ''}`}
          />
        ) : (
          <div className="grid size-full place-items-center text-ink-label">
            <Store aria-hidden className="size-8" strokeWidth={1.25} />
          </div>
        )}
        {restaurant.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.logoUrl}
            alt=""
            loading="lazy"
            className="absolute bottom-2.5 left-2.5 size-10 rounded-full border-2 border-white object-cover shadow-sm"
          />
        )}
        {closed && (
          <span className="absolute top-2.5 left-2.5 rounded-ny bg-ink/80 px-2 py-0.5 text-xs font-medium text-white">
            Closed
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-[15px] leading-snug font-semibold tracking-tight">{restaurant.name}</h3>
          <RatingChip rating={restaurant.rating} />
        </div>
        {restaurant.categories.length > 0 && (
          <p className="truncate text-[13px] text-ink-muted">{restaurant.categories.slice(0, 4).join(', ')}</p>
        )}
        <p className="mt-auto flex items-center gap-1.5 pt-1.5 text-[13px]">
          {fee && <span className={fee.tone}>{fee.text}</span>}
          {delivery !== null && (
            <>
              {fee && <span aria-hidden className="text-ink-label">·</span>}
              <span className="text-ink-muted tabular-nums">{formatDistance(delivery.distanceKm)}</span>
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
