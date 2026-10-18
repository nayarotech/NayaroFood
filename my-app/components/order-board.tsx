'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, apiPatch } from '@/lib/api';
import { formatDateTime, formatDistance, formatMoney, timeAgo } from '@/lib/format';
import { ActionDialog } from '@/components/action-dialog';
import { OrderStatusBadge, type OrderStatus } from '@/components/order-status-badge';
import { ReportCustomerDialog } from '@/components/report-customer-dialog';
import { Stars } from '@/components/stars';
import { Bike, Flag, ShieldAlert, TriangleAlert } from 'lucide-react';

export type { OrderStatus };

export interface DashboardOrder {
  id: number;
  orderNumber: string;
  trackingCode: string | null;
  status: OrderStatus;
  placedAt: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  distanceKm: number;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  note: string | null;
  items: { name: string; quantity: number }[];
  customerId: number;
  /** Reports about this customer from every restaurant on Nayaro. */
  customerReports: number;
  customerBlocked: boolean;
  rider: { id: number; name: string } | null;
  deliveryNote: string | null;
  rating: number | null;
}

export interface RiderOption {
  userId: number;
  name: string;
  active?: number;
}

const ASSIGNABLE: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

interface Action {
  to: OrderStatus;
  label: string;
  tone: 'primary' | 'danger';
  reason?: { label: string; suggestions: string[] };
}

const REJECT_REASONS = ['Item out of stock', 'Kitchen too busy', 'Outside delivery hours', 'Address unreachable'];
const CANCEL_REASONS = ['Customer requested', 'Customer unreachable', 'Item ran out', 'Delivery not possible'];

/**
 * The transitions the dashboard offers, mirroring the shared status machine.
 * The backend re-validates every one, so the two can never silently diverge.
 */
const NEXT_ACTIONS: Record<OrderStatus, Action[]> = {
  PENDING: [
    { to: 'ACCEPTED', label: 'Accept', tone: 'primary' },
    { to: 'REJECTED', label: 'Reject', tone: 'danger', reason: { label: 'Why are you rejecting it?', suggestions: REJECT_REASONS } },
  ],
  ACCEPTED: [
    { to: 'PREPARING', label: 'Start preparing', tone: 'primary' },
    { to: 'CANCELLED', label: 'Cancel', tone: 'danger', reason: { label: 'Why is it cancelled?', suggestions: CANCEL_REASONS } },
  ],
  PREPARING: [
    { to: 'READY', label: 'Mark ready', tone: 'primary' },
    { to: 'CANCELLED', label: 'Cancel', tone: 'danger', reason: { label: 'Why is it cancelled?', suggestions: CANCEL_REASONS } },
  ],
  READY: [
    { to: 'OUT_FOR_DELIVERY', label: 'Send out', tone: 'primary' },
    { to: 'CANCELLED', label: 'Cancel', tone: 'danger', reason: { label: 'Why is it cancelled?', suggestions: CANCEL_REASONS } },
  ],
  OUT_FOR_DELIVERY: [
    { to: 'DELIVERED', label: 'Mark delivered', tone: 'primary' },
    { to: 'CANCELLED', label: 'Cancel', tone: 'danger', reason: { label: 'Why is it cancelled?', suggestions: CANCEL_REASONS } },
  ],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function OrderBoard({
  initial,
  view,
  riders = [],
  canAssign = false,
}: {
  initial: DashboardOrder[];
  view: 'open' | 'history';
  riders?: RiderOption[];
  canAssign?: boolean;
}) {
  const router = useRouter();
  const [reporting, setReporting] = useState<DashboardOrder | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ order: DashboardOrder; action: Action } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Keep "3 min ago" honest without a refetch.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function assign(order: DashboardOrder, riderId: number | null) {
    setBusyId(order.id);
    setError(null);
    try {
      await apiPatch(`/restaurant/orders/${order.id}/rider`, { riderId });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not assign the rider.');
    }
    setBusyId(null);
  }

  async function advance(order: DashboardOrder, to: OrderStatus, reason?: string) {
    setBusyId(order.id);
    setError(null);
    try {
      await apiPatch(`/restaurant/orders/${order.id}/status`, { status: to, reason });
      setPending(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the order.');
    }
    setBusyId(null);
  }

  if (initial.length === 0) {
    return (
      <p className="rounded-ny-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-ink-muted">
        {view === 'open'
          ? 'No orders waiting on you right now. New ones will pop up here instantly.'
          : 'No orders yet.'}
      </p>
    );
  }

  return (
    <div>
      {error && !pending && (
        <p role="alert" className="mb-3 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {initial.map((order) => {
          const waitingMinutes = (now - new Date(order.placedAt).getTime()) / 60_000;
          const urgent = order.status === 'PENDING' && waitingMinutes >= 5;
          return (
            <li
              key={order.id}
              className={`rounded-ny-card border bg-surface p-4 ${
                order.status === 'PENDING'
                  ? urgent
                    ? 'border-danger/50 shadow-[0_0_0_3px_var(--ny-danger-soft)]'
                    : 'border-warning/50 shadow-[0_0_0_3px_var(--ny-warning-soft)]'
                  : 'border-line'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold tabular-nums">#{order.orderNumber}</span>
                    <OrderStatusBadge status={order.status} />
                    {order.trackingCode && (
                      <span className="font-mono text-[11px] text-ink-label" title="Customer's tracking code">
                        {order.trackingCode.slice(0, 2)}-{order.trackingCode.slice(2, 6)}-{order.trackingCode.slice(6)}
                      </span>
                    )}
                    <time
                      dateTime={order.placedAt}
                      title={formatDateTime(order.placedAt)}
                      className={`text-xs ${urgent ? 'font-semibold text-danger' : 'text-ink-label'}`}
                    >
                      {view === 'history' ? formatDateTime(order.placedAt) : timeAgo(order.placedAt, now)}
                      {urgent && ' — waiting'}
                    </time>
                  </div>
                  <p className="mt-1 text-sm text-ink-hi">
                    {order.customerName} ·{' '}
                    <a href={`tel:${order.customerPhone}`} className="font-mono hover:text-accent-label">
                      {order.customerPhone}
                    </a>
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {order.deliveryAddress} · {formatDistance(order.distanceKm)} away
                  </p>
                  {order.customerBlocked ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-danger">
                      <ShieldAlert aria-hidden className="size-3.5" /> Blocked by Nayaro — confirm before cooking
                    </p>
                  ) : order.customerReports > 0 ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-warning">
                      <TriangleAlert aria-hidden className="size-3.5" />
                      Reported {order.customerReports}× on Nayaro
                    </p>
                  ) : null}
                </div>

                <div className="text-right">
                  <p className="font-display text-lg font-bold tabular-nums">{formatMoney(order.totalMinor)}</p>
                  <p className="text-xs text-ink-label tabular-nums">
                    {formatMoney(order.subtotalMinor)} +{' '}
                    {order.deliveryFeeMinor === 0 ? 'free' : formatMoney(order.deliveryFeeMinor)} delivery · Cash
                  </p>
                </div>
              </div>

              <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line-soft pt-3 text-sm text-ink-muted">
                {order.items.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <span className="font-medium text-ink">{item.quantity}×</span> {item.name}
                  </li>
                ))}
              </ul>

              {order.note && (
                <p className="mt-2 rounded-ny bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                  Customer note: {order.note}
                </p>
              )}

              {(order.rider || (canAssign && ASSIGNABLE.includes(order.status)) || order.deliveryNote || order.rating) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
                  {canAssign && ASSIGNABLE.includes(order.status) ? (
                    <label className="flex items-center gap-1.5">
                      <Bike aria-hidden className="size-4 text-ink-label" />
                      <select
                        value={order.rider?.id ?? ''}
                        disabled={busyId === order.id}
                        onChange={(e) => void assign(order, e.target.value ? Number(e.target.value) : null)}
                        aria-label={`Rider for order ${order.orderNumber}`}
                        className="rounded-ny border border-line bg-surface px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                      >
                        <option value="">{riders.length === 0 ? 'No riders yet' : 'Assign a rider'}</option>
                        {riders.map((rider) => (
                          <option key={rider.userId} value={rider.userId}>
                            {rider.name}{rider.active ? ` (${rider.active} active)` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : order.rider ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Bike aria-hidden className="size-4 text-ink-label" /> {order.rider.name}
                    </span>
                  ) : null}
                  {order.deliveryNote && <span>Rider note: “{order.deliveryNote}”</span>}
                  {order.rating && (
                    <span className="inline-flex items-center gap-1">
                      <Stars value={order.rating} size={12} /> customer rating
                    </span>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {NEXT_ACTIONS[order.status].map((action) => (
                    <button
                      key={action.to}
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => {
                        setError(null);
                        if (action.reason) setPending({ order, action });
                        else void advance(order, action.to);
                      }}
                      className={`rounded-ny px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                        action.tone === 'primary'
                          ? 'bg-accent text-on-accent hover:bg-accent-hover'
                          : 'border border-danger/40 text-danger hover:bg-danger-soft'
                      }`}
                    >
                      {busyId === order.id && !action.reason ? 'Saving…' : action.label}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => setReporting(order)}
                  className="ml-auto inline-flex items-center gap-1 rounded-ny px-2 py-1.5 text-xs text-ink-label hover:bg-surface-muted hover:text-danger"
                >
                  <Flag aria-hidden className="size-3.5" /> Report customer
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {reporting && (
        <ReportCustomerDialog
          customerId={reporting.customerId}
          customerName={reporting.customerName}
          orderId={reporting.id}
          orderNumber={reporting.orderNumber}
          onClose={() => setReporting(null)}
        />
      )}

      <ActionDialog
        open={pending !== null}
        title={pending ? `${pending.action.label} order #${pending.order.orderNumber}?` : ''}
        description="The reason is saved with the order."
        confirmLabel={pending ? `${pending.action.label} order` : ''}
        tone="danger"
        reason={pending?.action.reason}
        busy={busyId !== null}
        error={pending ? error : null}
        onConfirm={(reason) => pending && void advance(pending.order, pending.action.to, reason)}
        onClose={() => {
          if (busyId === null) setPending(null);
        }}
      />
    </div>
  );
}
