'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, MapPin, Navigation, NotebookPen, Phone } from 'lucide-react';
import { ApiError, apiPatch, apiPut } from '@/lib/api';
import { formatDateTime, formatDistance, formatMoney, timeAgo } from '@/lib/format';
import { OrderStatusBadge, type OrderStatus } from '@/components/order-status-badge';
import { ActionDialog } from '@/components/action-dialog';
import { ReportCustomerDialog } from '@/components/report-customer-dialog';

export interface RiderOrder {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;
  scheduledFor: string | null;
  scheduleTimezone: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  customerName: string;
  customerPhone: string;
  address: string;
  landmark: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  collectMinor: number;
  note: string | null;
  deliveryNote: string | null;
  cancelledReason: string | null;
  items: { name: string; quantity: number }[];
}

const FAILED_REASONS = ['Customer not reachable', 'Customer refused the order', 'Wrong address', 'Customer cancelled at the door'];

export function RiderOrderCard({ order }: { order: RiderOrder }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(order.deliveryNote ?? '');

  async function setStatus(status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED', reason?: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/rider/orders/${order.id}/status`, { status, reason });
      setFailing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the delivery.');
    }
    setBusy(false);
  }

  async function saveNote() {
    setBusy(true);
    setError(null);
    try {
      await apiPut(`/rider/orders/${order.id}/note`, { note: note.trim() });
      setEditingNote(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the note.');
    }
    setBusy(false);
  }

  const active = ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(order.status);
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${order.latitude},${order.longitude}`;

  return (
    <article className={`rounded-ny-card border bg-surface p-4 ${order.status === 'OUT_FOR_DELIVERY' ? 'border-accent' : 'border-line'}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold tabular-nums">#{order.orderNumber}</span>
          <OrderStatusBadge status={order.status} />
        </div>
        <span className="text-xs text-ink-label">
          {active ? `Assigned ${timeAgo(order.assignedAt)}` : formatDateTime(order.deliveredAt ?? order.placedAt)}
        </span>
      </header>

      {order.scheduledFor && <p className="mt-2 text-xs text-accent-label">Scheduled dispatch: {new Intl.DateTimeFormat('en-GB', { timeZone: order.scheduleTimezone ?? 'Asia/Kathmandu', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.scheduledFor))} ({order.scheduleTimezone})</p>}
      <div className="mt-3">
        <p className="font-medium">{order.customerName}</p>
        <p className="mt-0.5 flex items-start gap-1.5 text-sm text-ink-muted">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-label" />
          <span>
            {order.address}
            {order.landmark && <span className="block text-ink-label">Landmark: {order.landmark}</span>}
            <span className="block text-xs text-ink-label">{formatDistance(order.distanceKm)} from the restaurant</span>
          </span>
        </p>
      </div>

      {active && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={`tel:${order.customerPhone}`}
            className="flex items-center justify-center gap-1.5 rounded-ny border border-line px-3 py-2.5 text-sm font-medium hover:border-line-strong">
            <Phone aria-hidden className="size-4" /> Call
          </a>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-ny border border-line px-3 py-2.5 text-sm font-medium hover:border-line-strong">
            <Navigation aria-hidden className="size-4" /> Navigate
          </a>
        </div>
      )}

      <ul className="mt-3 space-y-0.5 border-t border-line-soft pt-3 text-sm">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span className="font-medium tabular-nums">{item.quantity}×</span> {item.name}
          </li>
        ))}
      </ul>
      {order.note && <p className="mt-2 rounded-ny bg-surface-muted px-3 py-2 text-xs text-ink-muted">Customer note: {order.note}</p>}

      <p className="mt-3 flex items-baseline justify-between rounded-ny bg-surface-muted px-3 py-2">
        <span className="text-sm text-ink-muted">{order.status === 'DELIVERED' ? 'Collected' : 'Collect in cash'}</span>
        <span className="font-display text-lg font-bold tabular-nums">{formatMoney(order.collectMinor)}</span>
      </p>

      {order.cancelledReason && <p className="mt-2 text-sm text-danger">Not delivered: {order.cancelledReason}</p>}

      {editingNote ? (
        <div className="mt-3">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} autoFocus
            placeholder="e.g. Left with the guard at the gate"
            className="w-full rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditingNote(false)} className="px-3 py-1.5 text-sm text-ink-muted">Cancel</button>
            <button type="button" onClick={saveNote} disabled={busy}
              className="rounded-ny bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50">Save note</button>
          </div>
        </div>
      ) : order.deliveryNote ? (
        <p className="mt-2 text-sm text-ink-muted">Your note: “{order.deliveryNote}”</p>
      ) : null}

      {error && <p role="alert" className="mt-3 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {order.status === 'READY' && (
          <button type="button" disabled={busy} onClick={() => setStatus('OUT_FOR_DELIVERY')}
            className="flex-1 rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
            Picked up
          </button>
        )}
        {(order.status === 'ACCEPTED' || order.status === 'PREPARING') && (
          <span className="flex-1 rounded-ny bg-surface-muted px-4 py-2.5 text-center text-sm text-ink-muted">
            Waiting for the kitchen
          </span>
        )}
        {order.status === 'OUT_FOR_DELIVERY' && (
          <>
            <button type="button" disabled={busy} onClick={() => setStatus('DELIVERED')}
              className="flex-1 rounded-ny bg-success px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              Delivered
            </button>
            <button type="button" disabled={busy} onClick={() => setFailing(true)}
              className="rounded-ny border border-danger/40 px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger-soft">
              Couldn’t deliver
            </button>
          </>
        )}
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => setEditingNote(true)}
            className="inline-flex items-center gap-1 rounded-ny px-2 py-1.5 text-xs text-ink-muted hover:bg-surface-muted">
            <NotebookPen aria-hidden className="size-3.5" /> Note
          </button>
          <button type="button" onClick={() => setReporting(true)}
            className="inline-flex items-center gap-1 rounded-ny px-2 py-1.5 text-xs text-ink-muted hover:bg-surface-muted hover:text-danger">
            <Flag aria-hidden className="size-3.5" /> Report
          </button>
        </div>
      </footer>

      <ActionDialog
        open={failing}
        title={`Couldn’t deliver #${order.orderNumber}?`}
        description="The order will be marked as not delivered. Tell the restaurant what happened."
        confirmLabel="Mark not delivered"
        tone="danger"
        reason={{ label: 'What happened?', suggestions: FAILED_REASONS }}
        busy={busy}
        error={failing ? error : null}
        onConfirm={(reason) => void setStatus('CANCELLED', reason)}
        onClose={() => !busy && setFailing(false)}
      />
      {reporting && (
        <ReportCustomerDialog
          customerId={0}
          customerName={order.customerName}
          orderNumber={order.orderNumber}
          endpoint={`/rider/orders/${order.id}/report`}
          onClose={() => setReporting(false)}
        />
      )}
    </article>
  );
}
