'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiPatch } from '@/lib/api';
import { ActionDialog } from '@/components/action-dialog';
import type { OrderStatus } from '@/components/order-status-badge';

/** Mirrors the shared status machine for the SUPER_ADMIN actor. */
const NEXT: Record<OrderStatus, { to: OrderStatus; label: string; danger?: boolean }[]> = {
  PENDING: [
    { to: 'ACCEPTED', label: 'Accept for restaurant' },
    { to: 'REJECTED', label: 'Reject', danger: true },
    { to: 'CANCELLED', label: 'Cancel', danger: true },
  ],
  ACCEPTED: [{ to: 'PREPARING', label: 'Mark preparing' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  PREPARING: [{ to: 'READY', label: 'Mark ready' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  READY: [{ to: 'OUT_FOR_DELIVERY', label: 'Mark out for delivery' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  OUT_FOR_DELIVERY: [{ to: 'DELIVERED', label: 'Mark delivered' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

/**
 * Support override: move an order on a restaurant's behalf. Always asks for a
 * note, because it acts in someone else's name and lands in the audit log.
 */
export function AdminOrderActions({
  orderId,
  orderNumber,
  status,
}: {
  orderId: number;
  orderNumber: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<{ to: OrderStatus; label: string; danger?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (NEXT[status].length === 0) {
    return <p className="text-sm text-ink-muted">This order is final — no further changes are possible.</p>;
  }

  async function confirm(reason: string | undefined) {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/admin/orders/${orderId}/status`, { status: target.to, reason });
      setTarget(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the order.');
    }
    setBusy(false);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {NEXT[status].map((action) => (
          <button
            key={action.to}
            type="button"
            onClick={() => {
              setError(null);
              setTarget(action);
            }}
            className={`rounded-ny px-3 py-1.5 text-sm font-semibold transition-colors ${
              action.danger
                ? 'border border-danger/40 text-danger hover:bg-danger-soft'
                : 'border border-line text-ink-muted hover:border-accent-border hover:text-accent-label'
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-label">
        Use only when the restaurant can&rsquo;t. The restaurant&rsquo;s dashboard updates live, and the change is audited.
      </p>

      <ActionDialog
        open={target !== null}
        title={target ? `${target.label} — order #${orderNumber}?` : ''}
        description="This acts on the restaurant's behalf."
        confirmLabel={target?.label ?? ''}
        tone={target?.danger ? 'danger' : 'primary'}
        reason={{
          label: 'Note (saved with the order)',
          suggestions: target?.danger
            ? ['Restaurant unresponsive', 'Customer requested via support', 'Duplicate order']
            : ['Confirmed by phone with restaurant', 'Restaurant asked support to update'],
        }}
        busy={busy}
        error={error}
        onConfirm={confirm}
        onClose={() => {
          if (!busy) setTarget(null);
        }}
      />
    </>
  );
}
