'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiPatch } from '@/lib/api';
import { ActionDialog } from '@/components/action-dialog';
import type { RestaurantStatus } from '@/components/restaurant-status-pill';

type Action = 'verify' | 'block' | 'deactivate' | 'restore';

const ACTIONS: Record<
  Action,
  {
    to: RestaurantStatus;
    label: string;
    title: (name: string) => string;
    description: string;
    tone: 'primary' | 'danger';
    reason?: { label: string; suggestions: string[] };
  }
> = {
  verify: {
    to: 'ACTIVE',
    label: 'Verify',
    title: (name) => `Verify ${name}?`,
    description:
      'The restaurant goes live: it appears in the public listing and can take orders straight away.',
    tone: 'primary',
  },
  block: {
    to: 'SUSPENDED',
    label: 'Block',
    title: (name) => `Block ${name}?`,
    description:
      'Hidden from customers, no new orders, and the owner is locked out of their dashboard. Use for fraud, abuse or serious policy breaches.',
    tone: 'danger',
    reason: {
      label: 'Reason (shown to the owner)',
      suggestions: ['Fraudulent orders', 'Repeated customer complaints', 'Policy violation', 'Fake business details'],
    },
  },
  deactivate: {
    to: 'INACTIVE',
    label: 'Deactivate',
    title: (name) => `Deactivate ${name}?`,
    description:
      'Hidden from customers and cannot take orders, but the owner can still sign in, see their history and fix the issue. Use to reject an application or pause a restaurant.',
    tone: 'danger',
    reason: {
      label: 'Reason (shown to the owner)',
      suggestions: ['Incomplete application', 'Could not verify the business', 'Closed temporarily', 'Requested by owner'],
    },
  },
  restore: {
    to: 'ACTIVE',
    label: 'Reactivate',
    title: (name) => `Reactivate ${name}?`,
    description: 'The restaurant goes live again and can take orders immediately.',
    tone: 'primary',
  },
};

/** Which actions make sense from each status, in display order. */
const AVAILABLE: Record<RestaurantStatus, Action[]> = {
  PENDING: ['verify', 'deactivate', 'block'],
  ACTIVE: ['deactivate', 'block'],
  INACTIVE: ['restore', 'block'],
  SUSPENDED: ['restore', 'deactivate'],
};

export function RestaurantStatusActions({
  restaurantId,
  name,
  status,
  size = 'md',
}: {
  restaurantId: number;
  name: string;
  status: RestaurantStatus;
  size?: 'sm' | 'md';
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = action ? ACTIONS[action] : null;

  async function confirm(reason: string | undefined) {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/admin/restaurants/${restaurantId}/status`, { status: current.to, reason });
      setAction(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the restaurant.');
    }
    setBusy(false);
  }

  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm';

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {AVAILABLE[status].map((key) => {
          const spec = ACTIONS[key];
          const primary = spec.tone === 'primary';
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setError(null);
                setAction(key);
              }}
              className={`rounded-ny font-semibold transition-colors ${pad} ${
                primary
                  ? 'bg-accent text-on-accent hover:bg-accent-hover'
                  : key === 'block'
                    ? 'border border-danger/40 text-danger hover:bg-danger-soft'
                    : 'border border-line text-ink-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {spec.label}
            </button>
          );
        })}
      </div>

      <ActionDialog
        open={current !== null}
        title={current?.title(name) ?? ''}
        description={current?.description}
        confirmLabel={current?.label ?? ''}
        tone={current?.tone}
        reason={current?.reason}
        busy={busy}
        error={error}
        onConfirm={confirm}
        onClose={() => {
          if (!busy) setAction(null);
        }}
      />
    </>
  );
}
