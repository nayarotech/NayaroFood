import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { fetchAdmin } from '@/lib/dashboard-api';
import { formatDate, formatDateTime, formatMoney, timeAgo } from '@/lib/format';
import { PageHeader, Panel, StatTile } from '@/components/admin/page-header';
import { RestaurantStatusPill, type RestaurantStatus } from '@/components/restaurant-status-pill';
import { RestaurantStatusActions } from '@/components/admin/restaurant-status-actions';
import { OrderStatusBadge, type OrderStatus } from '@/components/order-status-badge';
import { describeAction } from '@/components/admin/audit-labels';

export const dynamic = 'force-dynamic';

interface Detail {
  restaurant: {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    phone: string;
    email: string | null;
    address: string;
    latitude: number | null;
    longitude: number | null;
    status: RestaurantStatus;
    statusReason: string | null;
    isOpen: number;
    onboardingStep: string;
    createdAt: string;
    approvedAt: string | null;
    statusChangedAt: string | null;
    acceptsOrders: number | null;
    minOrderMinor: number;
    defaultPrepTimeMinutes: number | null;
  };
  members: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    role: string;
    lastLoginAt: string | null;
  }[];
  stats: {
    totalOrders: number;
    delivered: number;
    cancelled: number;
    rejected: number;
    open: number;
    orders30d: number;
    customers: number;
    gmvMinor: number;
    lastOrderAt: string | null;
  };
  menu: { categories: number; items: number; availableItems: number };
  zones: { id: number; name: string | null; minDistanceKm: number; maxDistanceKm: number; feeMinor: number; isActive: number }[];
  ranking: { score: number; pinnedPosition: number | null; completenessScore: number } | null;
  recentOrders: {
    id: number;
    orderNumber: string;
    status: OrderStatus;
    placedAt: string;
    customerName: string;
    customerPhone: string;
    totalMinor: number;
  }[];
  history: {
    id: number;
    action: string;
    metadata: { reason?: string | null; from?: string; to?: string } | null;
    createdAt: string;
    actorEmail: string | null;
    actorName: string | null;
  }[];
}

export async function generateMetadata({ params }: PageProps<'/admin/restaurants/[restaurantId]'>) {
  const { restaurantId } = await params;
  const detail = await fetchAdmin<Detail>(`/admin/restaurants/${Number(restaurantId)}`);
  return { title: `${detail?.restaurant.name ?? 'Restaurant'} · Admin` };
}

export default async function AdminRestaurantPage({ params }: PageProps<'/admin/restaurants/[restaurantId]'>) {
  const { restaurantId } = await params;
  const id = Number(restaurantId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await fetchAdmin<Detail>(`/admin/restaurants/${id}`);
  if (!detail) notFound();

  const { restaurant: r, stats, menu, zones, members } = detail;
  const checklist: [string, boolean][] = [
    ['Location set on the map', r.latitude !== null && r.longitude !== null],
    ['At least one delivery zone', zones.some((zone) => zone.isActive === 1)],
    ['At least one dish on the menu', menu.items > 0],
    ['Description written', Boolean(r.description && r.description.length >= 20)],
    ['Contact email given', Boolean(r.email)],
  ];
  const ready = checklist.filter(([, ok]) => ok).length;

  return (
    <div>
      <Link href="/admin/restaurants" className="mb-3 inline-block text-sm text-ink-muted hover:text-accent-label">
        ← Restaurants
      </Link>

      <PageHeader
        title={r.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <RestaurantStatusPill status={r.status} admin />
            <span>Joined {formatDate(r.createdAt)}</span>
            {r.approvedAt && <span>· Verified {formatDate(r.approvedAt)}</span>}
            {r.status === 'ACTIVE' && (
              <Link href={`/r/${r.slug}` as Route} className="font-medium text-accent-label hover:underline">
                · Public page ↗
              </Link>
            )}
          </span>
        }
        actions={<RestaurantStatusActions restaurantId={r.id} name={r.name} status={r.status} />}
      />

      {r.statusReason && (r.status === 'SUSPENDED' || r.status === 'INACTIVE') && (
        <p
          className={`mb-5 rounded-ny-card px-4 py-3 text-sm ${
            r.status === 'SUSPENDED' ? 'bg-danger-soft text-danger' : 'border border-line-strong bg-surface-muted text-ink-hi'
          }`}
        >
          <span className="font-semibold">{r.status === 'SUSPENDED' ? 'Blocked' : 'Deactivated'}</span>
          {r.statusChangedAt && <> {timeAgo(r.statusChangedAt)}</>} — {r.statusReason}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total orders" value={stats.totalOrders.toLocaleString('en-IN')} hint={`${stats.orders30d} in 30 days`} />
        <StatTile label="Delivered value" value={formatMoney(stats.gmvMinor)} hint={`${stats.delivered} delivered`} tone="success" />
        <StatTile
          label="Cancelled · Rejected"
          value={`${stats.cancelled} · ${stats.rejected}`}
          tone={stats.cancelled + stats.rejected > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label="Open right now"
          value={String(stats.open)}
          hint={stats.lastOrderAt ? `Last order ${timeAgo(stats.lastOrderAt)}` : 'No orders yet'}
          tone={stats.open > 0 ? 'accent' : 'default'}
        />
      </dl>

      <div className="mt-5 grid gap-5 *:min-w-0 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Panel
            title="Recent orders"
            flush
            action={
              <Link href={`/admin/orders?restaurantId=${r.id}` as Route} className="text-xs font-semibold text-accent-label hover:underline">
                All {stats.totalOrders} orders →
              </Link>
            }
          >
            {detail.recentOrders.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {detail.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.id}` as Route}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <span className="w-16 font-semibold tabular-nums">#{order.orderNumber}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                        {order.customerName} · {formatDateTime(order.placedAt)}
                      </span>
                      <OrderStatusBadge status={order.status} />
                      <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatMoney(order.totalMinor)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Status & admin history" flush>
            {detail.history.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">No admin actions yet.</p>
            ) : (
              <ol className="divide-y divide-line-soft">
                {detail.history.map((entry) => (
                  <li key={entry.id} className="px-5 py-3 text-sm">
                    <p>
                      <span className="font-medium">{describeAction(entry.action)}</span>
                      <span className="text-ink-label"> by {entry.actorName ?? entry.actorEmail ?? 'system'}</span>
                    </p>
                    {entry.metadata?.reason && <p className="mt-0.5 text-xs text-ink-muted">“{entry.metadata.reason}”</p>}
                    <p className="mt-0.5 text-xs text-ink-label">{formatDateTime(entry.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title={`Verification checklist · ${ready}/${checklist.length}`}>
            <ul className="space-y-2 text-sm">
              {checklist.map(([label, ok]) => (
                <li key={label} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${
                      ok ? 'bg-success-soft text-success' : 'bg-surface-inset text-ink-label'
                    }`}
                  >
                    {ok ? '✓' : '–'}
                  </span>
                  <span className={ok ? 'text-ink' : 'text-ink-muted'}>{label}</span>
                  <span className="sr-only">{ok ? 'done' : 'missing'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-label">
              Restaurants can finish setup before or after verification; they only appear publicly once verified.
            </p>
          </Panel>

          <Panel title="Business details">
            <dl className="space-y-2.5 text-sm">
              <Detail label="Phone" value={<a href={`tel:${r.phone}`} className="font-mono hover:text-accent-label">{r.phone}</a>} />
              <Detail label="Email" value={r.email ? <a href={`mailto:${r.email}`} className="hover:text-accent-label">{r.email}</a> : '—'} />
              <Detail label="Address" value={r.address} />
              <Detail
                label="Location"
                value={
                  r.latitude !== null && r.longitude !== null ? (
                    <a
                      href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-accent-label hover:underline"
                    >
                      {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)} ↗
                    </a>
                  ) : (
                    <span className="text-warning">Not set</span>
                  )
                }
              />
              <Detail label="Trading" value={`${r.isOpen ? 'Open' : 'Closed'} · ${r.acceptsOrders ? 'accepting orders' : 'orders paused'}`} />
              <Detail label="Minimum order" value={r.minOrderMinor > 0 ? formatMoney(r.minOrderMinor) : 'None'} />
              <Detail label="Menu" value={`${menu.items} dishes (${menu.availableItems} available) in ${menu.categories} categories`} />
              <Detail label="Customers" value={String(stats.customers)} />
              {detail.ranking && (
                <Detail
                  label="Ranking score"
                  value={`${detail.ranking.score.toFixed(1)}${detail.ranking.pinnedPosition ? ` · pinned #${detail.ranking.pinnedPosition}` : ''}`}
                />
              )}
            </dl>
            {r.description && <p className="mt-4 border-t border-line-soft pt-3 text-sm text-ink-muted">{r.description}</p>}
          </Panel>

          <Panel title="Delivery zones">
            {zones.length === 0 ? (
              <p className="text-sm text-warning">No delivery zones — customers cannot check out.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {zones.map((zone) => (
                  <li key={zone.id} className={`flex justify-between gap-3 ${zone.isActive ? '' : 'text-ink-label line-through'}`}>
                    <span className="tabular-nums">
                      {zone.minDistanceKm}–{zone.maxDistanceKm} km{zone.name ? ` · ${zone.name}` : ''}
                    </span>
                    <span className="font-medium tabular-nums">{zone.feeMinor === 0 ? 'Free' : formatMoney(zone.feeMinor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Team">
            <ul className="space-y-3 text-sm">
              {members.map((member) => (
                <li key={member.id}>
                  <p className="font-medium">
                    {member.name}{' '}
                    <span className="text-xs font-normal text-ink-label">· {member.role.toLowerCase()}</span>
                    {member.status !== 'ACTIVE' && <span className="ml-1 text-xs text-danger">suspended</span>}
                  </p>
                  <p className="text-xs text-ink-muted">{member.email}{member.phone ? ` · ${member.phone}` : ''}</p>
                  <p className="text-xs text-ink-label">
                    Last sign-in: {member.lastLoginAt ? timeAgo(member.lastLoginAt) : 'never'}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <dt className="text-ink-label">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
