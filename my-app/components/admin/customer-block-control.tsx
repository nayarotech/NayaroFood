'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { ApiError, apiPatch } from '@/lib/api';
import { ActionDialog } from '@/components/action-dialog';
import { formatDateTime } from '@/lib/format';

/**
 * Block or unblock a customer. A block signs them out everywhere, stops
 * sign-in and ordering, and stops a new sign-up with the same phone.
 */
export function CustomerBlockControl({
  customerId,
  name,
  blocked,
  blockedReason,
  blockedAt,
}: {
  customerId: number;
  name: string;
  blocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(reason: string | undefined) {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/admin/customers/${customerId}/block`, { blocked: !blocked, reason });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the customer.');
    }
    setBusy(false);
  }

  return (
    <>
      {blocked ? (
        <div className="flex flex-wrap items-center gap-3 rounded-ny-card border border-danger/30 bg-danger-soft px-4 py-3">
          <ShieldAlert aria-hidden className="size-5 text-danger" />
          <div className="min-w-0 flex-1 text-sm text-danger">
            <p className="font-semibold">Blocked{blockedAt ? ` on ${formatDateTime(blockedAt)}` : ''}</p>
            {blockedReason && <p>{blockedReason}</p>}
          </div>
          <button type="button" onClick={() => { setError(null); setOpen(true); }}
            className="rounded-ny border border-danger/40 bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-soft">
            Unblock
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-ny-card border border-line bg-surface px-4 py-3">
          <p className="text-sm text-ink-muted">Blocking stops them signing in, ordering, or signing up again with this phone.</p>
          <button type="button" onClick={() => { setError(null); setOpen(true); }}
            className="rounded-ny bg-danger px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
            Block customer
          </button>
        </div>
      )}

      <ActionDialog
        open={open}
        title={blocked ? `Unblock ${name}?` : `Block ${name}?`}
        description={
          blocked
            ? 'They will be able to sign in and order again.'
            : 'They are signed out on every device and can’t sign in, order, or create a new account with this phone number.'
        }
        confirmLabel={blocked ? 'Unblock' : 'Block customer'}
        tone={blocked ? 'primary' : 'danger'}
        reason={blocked ? undefined : { label: 'Reason (kept in the activity log)', suggestions: ['Repeated no-shows', 'Fake orders', 'Abusive to riders'] }}
        busy={busy}
        error={error}
        onConfirm={confirm}
        onClose={() => !busy && setOpen(false)}
      />
    </>
  );
}
