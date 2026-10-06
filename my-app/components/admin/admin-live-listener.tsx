'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEventStream } from '@/lib/use-event-stream';
import { LiveIndicator } from '@/components/live-order-listener';
import { formatMoney } from '@/lib/format';

interface FeedItem {
  key: string;
  title: string;
  body: string;
  href: Route;
  tone: 'order' | 'restaurant';
}

/**
 * Platform-wide live feed for the Super Admin console: every new order and
 * every new restaurant application, as it happens. Pages re-render on each
 * event so counters and tables never go stale.
 */
export function AdminLiveListener() {
  const router = useRouter();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Busy platforms can emit many events a second; re-render at most every 1.5s.
  const refresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 1500);
  }, [router]);

  const push = (item: FeedItem) => setFeed((current) => [item, ...current.filter((i) => i.key !== item.key)].slice(0, 3));

  const state = useEventStream(
    '/admin/events',
    {
      'order.created': (data) => {
        const event = data as {
          restaurantName?: string;
          order?: { id: number; orderNumber: string; customerName: string; totalMinor: number };
        } | null;
        if (event?.order) {
          push({
            key: `order-${event.order.id}`,
            title: `New order #${event.order.orderNumber}`,
            body: `${event.restaurantName ?? 'Restaurant'} · ${event.order.customerName} · ${formatMoney(event.order.totalMinor)}`,
            href: `/admin/orders/${event.order.id}` as Route,
            tone: 'order',
          });
        }
        refresh();
      },
      'restaurant.registered': (data) => {
        const event = data as { restaurantId: number; name: string } | null;
        if (event) {
          push({
            key: `restaurant-${event.restaurantId}`,
            title: 'New restaurant application',
            body: `${event.name} is waiting for verification.`,
            href: `/admin/restaurants/${event.restaurantId}` as Route,
            tone: 'restaurant',
          });
        }
        refresh();
      },
      'order.status': refresh,
      'restaurant.status': refresh,
    },
    { onReconnect: refresh, onGone: () => router.refresh() },
  );

  useEffect(() => {
    if (feed.length === 0) return;
    const timer = setTimeout(() => setFeed((current) => current.slice(0, -1)), 10_000);
    return () => clearTimeout(timer);
  }, [feed]);

  return (
    <>
      <LiveIndicator state={state} />
      {feed.length > 0 && (
        <div role="status" aria-live="polite" className="fixed right-4 bottom-4 z-50 flex w-[min(340px,calc(100vw-32px))] flex-col gap-2">
          {feed.map((item) => (
            <div
              key={item.key}
              className="animate-[ny-pop_.25s_ease-out] rounded-ny-card border border-accent-border bg-surface p-3.5 shadow-[var(--ny-shadow-card-hover)]"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-ny text-xs font-bold ${
                    item.tone === 'order' ? 'bg-accent text-on-accent' : 'bg-warning-soft text-warning'
                  }`}
                >
                  {item.tone === 'order' ? '₨' : '+'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold tracking-tight">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">{item.body}</p>
                  <Link href={item.href} className="mt-1.5 inline-block text-xs font-semibold text-accent-label hover:underline">
                    Open →
                  </Link>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setFeed((current) => current.filter((i) => i.key !== item.key))}
                  className="text-ink-label transition-colors hover:text-ink"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
