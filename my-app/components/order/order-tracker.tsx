'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import { useEventStream } from '@/lib/use-event-stream';
import { loadCustomer } from '@/lib/cart';
import { formatDateTime, formatDistance, formatMoney } from '@/lib/format';
import { ActionDialog } from '@/components/action-dialog';

type Status = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'REJECTED' | 'CANCELLED';

export interface TrackedOrder {
  trackingCode: string;
  orderNumber: string;
  status: Status;
  placedAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  prepMinutes: number;
  cancelledReason: string | null;
  restaurant: { name: string; slug: string; phone: string; address: string };
  customer: { name: string; phone: string };
  delivery: { address: string; landmark: string | null; distanceKm: number };
  note: string | null;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  items: { name: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }[];
  history: { status: Status; at: string; by: string }[];
}

const STEPS: { status: Status; label: string }[] = [
  { status: 'PENDING', label: 'Order placed' },
  { status: 'ACCEPTED', label: 'Accepted' },
  { status: 'PREPARING', label: 'Preparing' },
  { status: 'READY', label: 'Ready' },
  { status: 'OUT_FOR_DELIVERY', label: 'On the way' },
  { status: 'DELIVERED', label: 'Delivered' },
];

const HEADLINE: Record<Status, { title: string; body: string; icon: string }> = {
  PENDING: { title: 'Waiting for the restaurant', body: 'Your order has been sent. The restaurant will accept it shortly.', icon: '🧾' },
  ACCEPTED: { title: 'Order accepted', body: 'The restaurant has your order and will start cooking soon.', icon: '👍' },
  PREPARING: { title: 'Being prepared', body: 'Your food is being cooked right now.', icon: '🍳' },
  READY: { title: 'Ready — waiting for the rider', body: 'Your food is packed and about to leave.', icon: '📦' },
  OUT_FOR_DELIVERY: { title: 'On the way to you', body: 'The rider is heading to your address. Keep your phone nearby.', icon: '🛵' },
  DELIVERED: { title: 'Delivered — enjoy your meal!', body: 'Thanks for ordering with Nayaro Food.', icon: '🎉' },
  REJECTED: { title: 'The restaurant couldn’t take this order', body: 'You haven’t been charged — orders are paid on delivery.', icon: '😔' },
  CANCELLED: { title: 'Order cancelled', body: 'You haven’t been charged — orders are paid on delivery.', icon: '✕' },
};

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' });
const prettyCode = (code: string) => `${code.slice(0, 2)}-${code.slice(2, 6)}-${code.slice(6)}`;

export function OrderTracker({ initial, justPlaced }: { initial: TrackedOrder; justPlaced: boolean }) {
  const [order, setOrder] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setOrder(await apiGet<TrackedOrder>(`/public/orders/code/${initial.trackingCode}`));
    } catch {
      // Keep showing the last known state; the next event or poll retries.
    }
  }, [initial.trackingCode]);

  const final = order.status === 'DELIVERED' || order.status === 'REJECTED' || order.status === 'CANCELLED';

  // Safety net under the live stream: poll slowly while the order is open.
  useEffect(() => {
    if (final) return;
    const timer = setInterval(() => void reload(), 45_000);
    return () => clearInterval(timer);
  }, [final, reload]);

  const failed = order.status === 'REJECTED' || order.status === 'CANCELLED';
  const currentIndex = STEPS.findIndex((s) => s.status === order.status);
  const reachedAt = (status: Status) => order.history.find((h) => h.status === status)?.at ?? null;
  const headline = HEADLINE[order.status];

  const readyBy =
    order.status === 'ACCEPTED' || order.status === 'PREPARING'
      ? new Date(new Date(order.acceptedAt ?? order.placedAt).getTime() + order.prepMinutes * 60_000)
      : null;

  async function share() {
    const url = `${window.location.origin}/orders/${order.trackingCode}`;
    try {
      if (navigator.share) await navigator.share({ title: `Order from ${order.restaurant.name}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Share sheet dismissed.
    }
  }

  async function cancel(reason: string | undefined) {
    const phone = loadCustomer()?.phone ?? (document.getElementById('cancel-phone') as HTMLInputElement | null)?.value ?? '';
    setCancelBusy(true);
    setCancelError(null);
    try {
      setOrder(await apiPost<TrackedOrder>(`/public/orders/code/${order.trackingCode}/cancel`, { phone, reason }));
      setCancelOpen(false);
    } catch (caught) {
      setCancelError(caught instanceof ApiError ? caught.message : 'Could not cancel. Please call the restaurant.');
    }
    setCancelBusy(false);
  }

  return (
    <div>
      {!final && <LiveUpdates code={order.trackingCode} onChange={reload} />}

      {justPlaced && (
        <div className="mb-5 rounded-ny-card border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          <p className="font-semibold">Your order is placed! 🎉</p>
          <p className="mt-0.5">Keep this page open, or save your tracking code to check back any time.</p>
        </div>
      )}

      {/* Tracking code, front and centre. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-label uppercase">Tracking code</p>
          <p className="font-mono text-2xl font-bold tracking-wider sm:text-3xl">{prettyCode(order.trackingCode)}</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Order #{order.orderNumber} from{' '}
            <Link href={`/r/${order.restaurant.slug}` as Route} className="font-medium text-accent-label hover:underline">
              {order.restaurant.name}
            </Link>{' '}
            · {formatDateTime(order.placedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={share}
            className="rounded-ny border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink-muted hover:border-accent-border hover:text-accent-label">
            {copied ? 'Link copied ✓' : 'Share tracking link'}
          </button>
          <a href={`tel:${order.restaurant.phone}`}
            className="rounded-ny bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover">
            Call restaurant
          </a>
        </div>
      </div>

      {/* Where it's at. */}
      <section className={`mt-6 rounded-ny-card border p-5 ${failed ? 'border-danger/30 bg-danger-soft' : 'border-accent-border bg-surface shadow-[var(--ny-shadow-card)]'}`}>
        <div className="flex items-start gap-4">
          <span aria-hidden className={`grid size-12 shrink-0 place-items-center rounded-full text-2xl ${failed ? 'bg-surface' : 'bg-accent-soft'}`}>
            {headline.icon}
          </span>
          <div className="min-w-0">
            <h1 className={`font-display text-xl font-bold tracking-tight ${failed ? 'text-danger' : ''}`} aria-live="polite">
              {headline.title}
            </h1>
            <p className={`mt-0.5 text-sm ${failed ? 'text-danger' : 'text-ink-muted'}`}>{headline.body}</p>
            {failed && order.cancelledReason && <p className="mt-1 text-sm font-medium text-danger">Reason: {order.cancelledReason}</p>}
            {readyBy && (
              <p className="mt-2 text-sm">
                Usually ready by <span className="font-semibold">{TIME.format(readyBy)}</span>
                <span className="text-ink-label"> · then delivery ({formatDistance(order.delivery.distanceKm)})</span>
              </p>
            )}
          </div>
        </div>

        {!failed && (
          <ol className="mt-6 grid grid-cols-6 gap-1" aria-label="Order progress">
            {STEPS.map((step, index) => {
              const done = index <= currentIndex;
              const current = index === currentIndex;
              const at = reachedAt(step.status);
              return (
                <li key={step.status} className="min-w-0" aria-current={current ? 'step' : undefined}>
                  <div className={`h-1.5 rounded-full ${done ? 'bg-accent' : 'bg-surface-inset'} ${current && !final ? 'animate-pulse' : ''}`} />
                  <p className={`mt-2 truncate text-[11px] font-medium sm:text-xs ${done ? 'text-ink' : 'text-ink-label'}`}>{step.label}</p>
                  {at && <p className="text-[10px] text-ink-label tabular-nums sm:text-[11px]">{TIME.format(new Date(at))}</p>}
                </li>
              );
            })}
          </ol>
        )}

        {order.status === 'PENDING' && (
          <button type="button" onClick={() => { setCancelError(null); setCancelOpen(true); }}
            className="mt-5 text-sm font-medium text-danger hover:underline">
            Cancel this order
          </button>
        )}
      </section>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <section className="rounded-ny-card border border-line bg-surface p-5">
          <h2 className="font-display text-sm font-semibold tracking-tight">Your order</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {order.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex gap-2">
                <span className="font-semibold tabular-nums">{item.quantity}×</span>
                <span className="min-w-0 flex-1">{item.name}</span>
                <span className="tabular-nums">{formatMoney(item.lineTotalMinor)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-line-soft pt-3 text-sm">
            <div className="flex justify-between text-ink-muted"><dt>Subtotal</dt><dd className="tabular-nums">{formatMoney(order.subtotalMinor)}</dd></div>
            <div className="flex justify-between text-ink-muted"><dt>Delivery</dt><dd className="tabular-nums">{order.deliveryFeeMinor === 0 ? 'Free' : formatMoney(order.deliveryFeeMinor)}</dd></div>
            <div className="flex justify-between pt-1 font-display text-base font-bold"><dt>Total · cash on delivery</dt><dd className="tabular-nums">{formatMoney(order.totalMinor)}</dd></div>
          </dl>
        </section>

        <section className="rounded-ny-card border border-line bg-surface p-5">
          <h2 className="font-display text-sm font-semibold tracking-tight">Delivering to</h2>
          <p className="mt-3 text-sm font-medium">{order.customer.name} <span className="font-mono text-xs font-normal text-ink-label">{order.customer.phone}</span></p>
          <p className="text-sm text-ink-muted">{order.delivery.address}</p>
          {order.delivery.landmark && <p className="text-sm text-ink-muted">Landmark: {order.delivery.landmark}</p>}
          <p className="mt-1 text-xs text-ink-label">{formatDistance(order.delivery.distanceKm)} from {order.restaurant.name}</p>
          {order.note && <p className="mt-3 rounded-ny bg-surface-muted px-3 py-2 text-xs text-ink-muted">Your note: {order.note}</p>}
        </section>
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/orders" className="text-ink-muted hover:text-accent-label">All my orders</Link>
        <span className="mx-2 text-ink-label">·</span>
        <Link href={`/r/${order.restaurant.slug}` as Route} className="text-ink-muted hover:text-accent-label">Order again</Link>
      </p>

      <ActionDialog
        open={cancelOpen}
        title="Cancel this order?"
        description={
          <>
            <p>You can cancel until the restaurant accepts it.</p>
            {!loadCustomer()?.phone && (
              <label className="mt-3 block text-sm">
                <span className="mb-1 block font-medium text-ink-hi">Phone you ordered with</span>
                <input id="cancel-phone" type="tel" placeholder="98XXXXXXXX"
                  className="w-full rounded-ny border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" />
              </label>
            )}
          </>
        }
        confirmLabel="Cancel order"
        tone="danger"
        reason={{ label: 'Why are you cancelling?', suggestions: ['Ordered by mistake', 'Taking too long', 'Want to change my order'] }}
        busy={cancelBusy}
        error={cancelError}
        onConfirm={cancel}
        onClose={() => !cancelBusy && setCancelOpen(false)}
      />
    </div>
  );
}

/** Live status from the restaurant. Mounted only while the order is open. */
function LiveUpdates({ code, onChange }: { code: string; onChange: () => void }) {
  const state = useEventStream(`/public/orders/code/${code}/events`, { 'order.status': onChange }, { onReconnect: onChange });
  return (
    <p className="mb-4 inline-flex items-center gap-1.5 rounded-ny-pill border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted">
      <span className={`size-2 rounded-full ${state === 'live' ? 'bg-success' : 'bg-warning'}`} />
      {state === 'live' ? 'Live — updates appear automatically' : 'Connecting for live updates…'}
    </p>
  );
}
