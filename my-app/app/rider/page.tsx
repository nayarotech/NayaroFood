import Link from 'next/link';
import type { Route } from 'next';
import { fetchPaged, fetchTenant, param } from '@/lib/dashboard-api';
import { getSession } from '@/lib/session';
import { formatMoney } from '@/lib/format';
import { RiderOrderCard, type RiderOrder } from '@/components/rider/rider-order-card';
import { PushToggle } from '@/components/push-toggle';

export const metadata = { title: 'My deliveries' };
export const dynamic = 'force-dynamic';

interface Summary {
  restaurant: { name: string; phone: string } | null;
  active: number;
  deliveredToday: number;
  cashCollectedTodayMinor: number;
  deliveredAllTime: number;
}

export default async function RiderHome({ searchParams }: PageProps<'/rider'>) {
  const view = param((await searchParams).view) === 'done' ? 'done' : 'active';
  const [session, summary, orders] = await Promise.all([
    getSession(),
    fetchTenant<Summary>('/rider/summary'),
    fetchPaged<RiderOrder>(`/rider/orders?view=${view}&perPage=30`),
  ]);

  const tab = (value: 'active' | 'done', label: string) => (
    <Link
      href={(value === 'active' ? '/rider' : '/rider?view=done') as Route}
      aria-current={view === value ? 'page' : undefined}
      className={`flex-1 rounded-ny px-3 py-2 text-center text-sm font-medium ${
        view === value ? 'bg-surface text-ink shadow-[var(--ny-shadow-card)] ring-1 ring-line' : 'text-ink-muted'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-label">{summary?.restaurant?.name ?? 'Your restaurant'}</p>
          <h1 className="font-display text-xl font-bold tracking-tight">Hi, {session?.user.name.split(' ')[0]}</h1>
        </div>
        {summary?.restaurant?.phone && (
          <a href={`tel:${summary.restaurant.phone}`} className="rounded-ny border border-line bg-surface px-3 py-1.5 text-sm font-medium">
            Call restaurant
          </a>
        )}
      </header>

      {summary && (
        <dl className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Active" value={String(summary.active)} />
          <Stat label="Delivered today" value={String(summary.deliveredToday)} />
          <Stat label="Cash today" value={formatMoney(summary.cashCollectedTodayMinor)} />
        </dl>
      )}

      <nav aria-label="Deliveries" className="mt-5 flex gap-1 rounded-ny-card bg-surface-inset p-1">
        {tab('active', `Active${summary ? ` (${summary.active})` : ''}`)}
        {tab('done', 'Completed')}
      </nav>

      <div className="mt-4 space-y-3">
        {!orders ? (
          <p className="rounded-ny-card border border-line bg-surface p-6 text-sm text-ink-muted">Couldn’t load your deliveries.</p>
        ) : orders.items.length === 0 ? (
          <p className="rounded-ny-card border border-line bg-surface px-6 py-10 text-center text-sm text-ink-muted">
            {view === 'active' ? 'Nothing assigned right now. New deliveries appear here instantly.' : 'No completed deliveries yet.'}
          </p>
        ) : (
          orders.items.map((order) => <RiderOrderCard key={order.id} order={order} />)
        )}
      </div>

      <div className="mt-8">
        <PushToggle />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ny-card border border-line bg-surface px-3 py-2.5">
      <dt className="text-[11px] text-ink-label">{label}</dt>
      <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}
