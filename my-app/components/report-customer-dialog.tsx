'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiPost } from '@/lib/api';
import { REMARK_REASONS } from '@/lib/remarks';


/**
 * File an incident report about a customer. Reports go to Nayaro, who can
 * block repeat offenders; other restaurants only ever see a count.
 */
export function ReportCustomerDialog({
  customerId,
  customerName,
  orderId,
  orderNumber,
  endpoint,
  onClose,
}: {
  customerId: number;
  customerName: string;
  orderId?: number;
  orderNumber?: string;
  /** Riders post to their own route; defaults to the restaurant's. */
  endpoint?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('NOT_REACHABLE');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost(endpoint ?? `/restaurant/customers/${customerId}/remarks`, {
        reason,
        note: note.trim(),
        ...(orderId && !endpoint ? { orderId } : {}),
      });
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not send the report.');
    }
    setBusy(false);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="report-title"
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-ny-card border border-line bg-surface p-0 text-ink shadow-[var(--ny-shadow-card-hover)] backdrop:bg-black/40"
    >
      {done ? (
        <div className="p-5">
          <h2 id="report-title" className="font-display text-lg font-bold">Report sent</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Thanks. Nayaro reviews customers who are reported repeatedly and can block them from ordering.
          </p>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => ref.current?.close()}
              className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover">
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="p-5">
          <h2 id="report-title" className="font-display text-lg font-bold">Report {customerName}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {orderNumber ? `About order #${orderNumber}. ` : ''}Reports are private — the customer never sees them.
          </p>

          <fieldset className="mt-4">
            <legend className="mb-1.5 text-sm font-medium text-ink-hi">What happened?</legend>
            <div className="space-y-1">
              {REMARK_REASONS.map((option) => (
                <label key={option.value}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-ny border px-3 py-2 text-sm ${
                    reason === option.value ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'
                  }`}>
                  <input type="radio" name="reason" value={option.value} checked={reason === option.value}
                    onChange={() => setReason(option.value)} className="accent-[var(--ny-accent)]" />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="report-note" className="mt-4 mb-1 block text-sm font-medium text-ink-hi">
            Details <span className="font-normal text-ink-label">(optional)</span>
          </label>
          <textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500}
            placeholder="e.g. Called 4 times at the gate, phone switched off."
            className="w-full rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none" />

          {error && <p role="alert" className="mt-3 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} disabled={busy}
              className="rounded-ny border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="rounded-ny bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
