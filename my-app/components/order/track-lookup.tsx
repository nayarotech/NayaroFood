'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { ApiError, apiPost } from '@/lib/api';
import { loadRecentOrders, type RecentOrder } from '@/lib/cart';
import { formatMoney, timeAgo } from '@/lib/format';
import { ChevronRight } from 'lucide-react';

const EMPTY: RecentOrder[] = [];
let cached: { raw: string; list: RecentOrder[] } | null = null;
function recentSnapshot(): RecentOrder[] {
  const list = loadRecentOrders();
  const raw = JSON.stringify(list);
  if (cached?.raw !== raw) cached = { raw, list };
  return cached.list;
}

export function TrackLookup() {
  const router = useRouter();
  const recent = useSyncExternalStore(
    (cb) => {
      window.addEventListener('storage', cb);
      return () => window.removeEventListener('storage', cb);
    },
    recentSnapshot,
    () => EMPTY,
  );
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'code' | 'number'>('code');
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function byCode(event: React.FormEvent) {
    event.preventDefault();
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^NY[A-Z0-9]{8}$/.test(clean)) {
      setError('That doesn’t look like a tracking code. It starts with NY, e.g. NY-7K3Q-F9TZ.');
      return;
    }
    setError(null);
    router.push(`/orders/${clean}` as Route);
  }

  async function byNumber(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const order = await apiPost<{ trackingCode: string }>('/public/orders/track', {
        orderNumber: orderNumber.trim().replace(/^#/, ''),
        phone: phone.trim(),
      });
      router.push(`/orders/${order.trackingCode}` as Route);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not find that order.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-hi">Your recent orders on this device</h2>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-ny-card border border-line bg-surface">
            {recent.map((order) => (
              <li key={order.trackingCode}>
                <Link href={`/orders/${order.trackingCode}` as Route} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{order.restaurantName}</p>
                    <p className="text-xs text-ink-label">Order #{order.orderNumber} · {timeAgo(order.placedAt)}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(order.totalMinor)}</span>
                  <ChevronRight aria-hidden className="size-4 text-ink-label" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-ny-card border border-line bg-surface p-5">
        {mode === 'code' ? (
          <form onSubmit={byCode} noValidate>
            <label htmlFor="tracking-code" className="mb-1 block text-sm font-medium text-ink-hi">Tracking code</label>
            <div className="flex gap-2">
              <input id="tracking-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="NY-7K3Q-F9TZ"
                autoCapitalize="characters" autoComplete="off" spellCheck={false}
                className="min-w-0 flex-1 rounded-ny border border-line bg-surface px-3.5 py-2.5 font-mono text-sm tracking-wider uppercase focus:border-accent focus:outline-none" />
              <button type="submit" className="rounded-ny bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover">Track</button>
            </div>
          </form>
        ) : (
          <form onSubmit={byNumber} noValidate className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="order-number" className="mb-1 block text-sm font-medium text-ink-hi">Order number</label>
                <input id="order-number" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="1024"
                  className="w-full rounded-ny border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none" />
              </div>
              <div>
                <label htmlFor="order-phone" className="mb-1 block text-sm font-medium text-ink-hi">Phone you ordered with</label>
                <input id="order-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX"
                  className="w-full rounded-ny border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none" />
              </div>
            </div>
            <button type="submit" disabled={busy} className="rounded-ny bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
              {busy ? 'Finding…' : 'Find my order'}
            </button>
          </form>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <button type="button" onClick={() => { setMode(mode === 'code' ? 'number' : 'code'); setError(null); }}
          className="mt-4 text-sm text-accent-label hover:underline">
          {mode === 'code' ? 'Lost the code? Use your order number and phone instead' : 'I have a tracking code'}
        </button>
      </section>
    </div>
  );
}
