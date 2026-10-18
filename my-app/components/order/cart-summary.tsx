'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCart } from '@/lib/cart';
import { formatMoney } from '@/lib/format';
import type { DeliveryQuote } from '@/lib/types';

/**
 * The running total. The delivery fee shown is the server's quote for the
 * customer's pin; without a pin we say so rather than guess.
 */
export function CartSummary({
  restaurantId,
  slug,
  delivery,
  minOrderMinor,
  closed,
  locationQuery,
}: {
  restaurantId: number;
  slug: string;
  delivery: DeliveryQuote | null;
  minOrderMinor: number;
  closed: boolean;
  locationQuery: string;
}) {
  const cart = useCart(restaurantId);
  const checkoutHref = `/r/${slug}/checkout${locationQuery}` as Route;
  const fee = delivery?.deliverable ? delivery.feeMinor : null;
  const belowMinimum = minOrderMinor > 0 && cart.subtotalMinor < minOrderMinor;
  const total = cart.subtotalMinor + (fee ?? 0);
  const blocked = closed || belowMinimum || (delivery !== null && !delivery.deliverable);

  if (cart.count === 0) {
    return (
      <div className="rounded-ny-card border border-line bg-surface p-4">
        <h2 className="font-display text-sm font-semibold tracking-tight">Your order</h2>
        <p className="mt-2 text-sm text-ink-muted">
          {closed ? 'This restaurant is closed right now.' : 'Tap “Add” on a dish to start your order.'}
        </p>
        {minOrderMinor > 0 && <p className="mt-1 text-xs text-ink-label">Minimum order {formatMoney(minOrderMinor)}.</p>}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-ny-card border border-accent-border bg-surface p-4 shadow-[var(--ny-shadow-card)]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold tracking-tight">Your order</h2>
          <button type="button" onClick={cart.clear} className="text-xs text-ink-label hover:text-danger">
            Clear
          </button>
        </div>
        <ul className="mt-3 space-y-1.5 text-sm">
          {cart.lines.map((line) => (
            <li key={line.id} className="flex gap-2">
              <span className="font-semibold tabular-nums">{line.quantity}×</span>
              <span className="min-w-0 flex-1 truncate">{line.name}</span>
              <span className="tabular-nums">{formatMoney(line.priceMinor * line.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line-soft pt-3 text-sm">
          <Row label="Subtotal" value={formatMoney(cart.subtotalMinor)} />
          <Row
            label="Delivery"
            value={fee === null ? (delivery ? 'Not available' : 'Set at checkout') : fee === 0 ? 'Free' : formatMoney(fee)}
          />
          <div className="flex justify-between pt-1 font-display text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(total)}</dd>
          </div>
        </dl>
        {belowMinimum && (
          <p className="mt-2 rounded-ny bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
            Add {formatMoney(minOrderMinor - cart.subtotalMinor)} more — minimum order is {formatMoney(minOrderMinor)}.
          </p>
        )}
        {blocked ? (
          <span className="mt-3 block rounded-ny bg-surface-inset px-4 py-2.5 text-center text-sm font-semibold text-ink-label">
            {closed ? 'Closed right now' : belowMinimum ? 'Below minimum order' : 'Outside delivery area'}
          </span>
        ) : (
          <Link
            href={checkoutHref}
            className="mt-3 block rounded-ny bg-accent px-4 py-2.5 text-center text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] transition-colors hover:bg-accent-hover"
          >
            Go to checkout
          </Link>
        )}
        <p className="mt-2 text-center text-[11px] text-ink-label">Cash on delivery</p>
      </div>

      {/* Phones: the cart lives in a bar along the bottom. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-label">{cart.count} item{cart.count === 1 ? '' : 's'}</p>
            <p className="font-display text-base font-bold tabular-nums">{formatMoney(total)}</p>
          </div>
          {blocked ? (
            <span className="rounded-ny bg-surface-inset px-4 py-2.5 text-sm font-semibold text-ink-label">
              {closed ? 'Closed' : belowMinimum ? `Min ${formatMoney(minOrderMinor)}` : 'Out of range'}
            </span>
          ) : (
            <Link href={checkoutHref} className="rounded-ny bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)]">
              Checkout
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-muted">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
