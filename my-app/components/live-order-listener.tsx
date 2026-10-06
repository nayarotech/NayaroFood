'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEventStream, type StreamState } from '@/lib/use-event-stream';
import { playChime, primeAudio, soundEnabled } from '@/lib/chime';
import { formatMoney } from '@/lib/format';

interface IncomingOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  totalMinor: number;
  distanceKm: number;
  items: { name: string; quantity: number }[];
}

/** How often an unanswered order re-chimes. A kitchen is loud. */
const REMIND_EVERY_MS = 20_000;

/**
 * Keeps an open restaurant dashboard live.
 *
 * On a new order it: chimes (and keeps chiming until someone acknowledges or
 * the order is accepted/rejected), shows a card in the corner, puts the count
 * in the tab title, raises a desktop notification if the tab is in the
 * background, and refreshes the server-rendered board and badges.
 *
 * This is the "tab is open" channel. With the dashboard closed, Web Push (set
 * up under Notifications) is what reaches the restaurant.
 */
export function LiveOrderListener() {
  const router = useRouter();
  const [incoming, setIncoming] = useState<IncomingOrder[]>([]);
  const baseTitle = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Coalesce bursts of events into one server re-render.
  const refresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 400);
  }, [router]);

  useEffect(() => primeAudio(), []);

  const state = useEventStream(
    '/restaurant/events',
    {
      'order.created': (data) => {
        const order = (data as { order?: IncomingOrder } | null)?.order;
        if (order?.id) {
          setIncoming((current) =>
            current.some((o) => o.id === order.id) ? current : [order, ...current].slice(0, 5),
          );
          if (soundEnabled()) playChime();
          void notifyDesktop(order, () => router.push('/dashboard/orders'));
        }
        refresh();
      },
      'order.status': (data) => {
        // Once someone acts on an order, stop nagging about it.
        const { orderId } = (data ?? {}) as { orderId?: number };
        if (orderId) setIncoming((current) => current.filter((o) => o.id !== orderId));
        refresh();
      },
      'restaurant.status': () => router.refresh(),
    },
    {
      // Anything could have happened while disconnected; resync.
      onReconnect: refresh,
      onGone: () => router.refresh(),
    },
  );

  // Re-chime while orders are waiting.
  useEffect(() => {
    if (incoming.length === 0) return;
    const timer = setInterval(() => {
      if (soundEnabled()) playChime();
    }, REMIND_EVERY_MS);
    return () => clearInterval(timer);
  }, [incoming.length]);

  // "(2) New orders" in the tab title, so a background tab is still noticeable.
  useEffect(() => {
    if (baseTitle.current === null) baseTitle.current = document.title.replace(/^\(\d+\)\s*/, '');
    const base = baseTitle.current;
    document.title = incoming.length > 0 ? `(${incoming.length}) New order · ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [incoming.length]);

  const dismiss = (id: number) => setIncoming((current) => current.filter((o) => o.id !== id));

  return (
    <>
      <LiveIndicator state={state} />

      {incoming.length > 0 && (
        <div
          role="status"
          aria-live="assertive"
          className="fixed right-4 bottom-4 z-50 flex w-[min(340px,calc(100vw-32px))] flex-col gap-2"
        >
          {incoming.map((order) => (
            <div
              key={order.id}
              className="animate-[ny-pop_.25s_ease-out] rounded-ny-card border-2 border-accent bg-surface p-4 shadow-[var(--ny-shadow-card-hover)]"
            >
              <div className="flex items-start gap-3">
                <span aria-hidden className="relative mt-0.5 grid size-9 shrink-0 place-items-center rounded-ny bg-accent text-on-accent">
                  <span className="absolute inset-0 animate-ping rounded-ny bg-accent opacity-40" />
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="relative size-4">
                    <path d="M3.5 5.5h13l-1 10a1.5 1.5 0 0 1-1.5 1.35H6a1.5 1.5 0 0 1-1.5-1.35Z" strokeLinejoin="round" />
                    <path d="M7 5.5a3 3 0 0 1 6 0" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold tracking-tight">
                    New order #{order.orderNumber}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {order.customerName} · {formatMoney(order.totalMinor)} · {order.distanceKm} km
                  </p>
                  {order.items?.length > 0 && (
                    <p className="mt-1 truncate text-xs text-ink-subtle">
                      {order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}
                    </p>
                  )}
                  <div className="mt-2.5 flex gap-2">
                    <Link
                      href="/dashboard/orders"
                      onClick={() => dismiss(order.id)}
                      className="rounded-ny bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover"
                    >
                      View order
                    </Link>
                    <button
                      type="button"
                      onClick={() => dismiss(order.id)}
                      className="rounded-ny border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                    >
                      Got it
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * A desktop notification for a backgrounded tab — but only when Web Push is
 * not set up on this device, because the service worker already shows one for
 * every push and two alerts per order is noise.
 */
async function notifyDesktop(order: IncomingOrder, open: () => void): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/');
    if (await registration?.pushManager.getSubscription()) return;
    const notification = new Notification(`New order #${order.orderNumber}`, {
      body: `${order.customerName} · ${formatMoney(order.totalMinor)}`,
      tag: `order-${order.id}`,
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      open();
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

/** A small "Live" pill so staff can trust that silence means no orders. */
export function LiveIndicator({ state }: { state: StreamState }) {
  const spec = {
    live: { dot: 'bg-success', text: 'Live — new orders appear instantly', short: 'Connected · live' },
    connecting: { dot: 'bg-warning', text: 'Connecting…', short: 'Connecting' },
    reconnecting: { dot: 'bg-warning', text: 'Reconnecting…', short: 'Reconnecting' },
    offline: { dot: 'bg-danger', text: 'Offline — refresh the page', short: 'Offline' },
  }[state];

  return (
    <p
      title={spec.text}
      className="mb-3 inline-flex items-center gap-1.5 rounded-ny-pill border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted"
    >
      <span className="relative flex size-2">
        {state === 'live' && (
          <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${spec.dot}`} />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${spec.dot}`} />
      </span>
      {spec.short}
    </p>
  );
}
