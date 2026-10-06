'use client';

import { useCart } from '@/lib/cart';

/** "Add" until it's in the cart, then a − qty + stepper. */
export function AddToCart({
  restaurantId,
  item,
  disabled = false,
}: {
  restaurantId: number;
  item: { id: number; name: string; priceMinor: number };
  disabled?: boolean;
}) {
  const cart = useCart(restaurantId);
  const quantity = cart.quantityOf(item.id);

  if (quantity === 0) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => cart.setQuantity(item, 1)}
        aria-label={`Add ${item.name} to cart`}
        className="rounded-ny-pill border border-accent-border bg-accent-soft px-3.5 py-1 text-sm font-semibold text-accent-label transition-colors hover:bg-accent hover:text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add
      </button>
    );
  }

  return (
    <div className="flex items-center overflow-hidden rounded-ny-pill bg-accent text-on-accent shadow-[var(--ny-shadow-accent)]">
      <button
        type="button"
        onClick={() => cart.setQuantity(item, quantity - 1)}
        aria-label={`Remove one ${item.name}`}
        className="px-2.5 py-1 text-base leading-none font-bold transition-colors hover:bg-white/15"
      >
        −
      </button>
      <span aria-live="polite" className="min-w-5 text-center text-sm font-bold tabular-nums">
        {quantity}
      </span>
      <button
        type="button"
        disabled={disabled || quantity >= 99}
        onClick={() => cart.setQuantity(item, quantity + 1)}
        aria-label={`Add one more ${item.name}`}
        className="px-2.5 py-1 text-base leading-none font-bold transition-colors hover:bg-white/15 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
