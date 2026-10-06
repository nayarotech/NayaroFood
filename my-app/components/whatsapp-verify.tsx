'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiPost } from '@/lib/api';

/**
 * WhatsApp number verification.
 *
 * A number is stored the moment it is submitted but stays PENDING until the
 * code comes back. Only a VERIFIED number ever receives an order — that rule
 * is enforced in the API, not here.
 */
export function WhatsAppVerify({
  currentNumber,
  status,
}: {
  currentNumber: string | null;
  status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED';
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(currentNumber ?? '');
  const [stage, setStage] = useState<'idle' | 'code'>(status === 'PENDING' ? 'code' : 'idle');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function request() {
    setBusy(true);
    setMessage(null);
    try {
      await apiPost('/restaurant/whatsapp/request', { whatsappNumber: phone });
      setStage('code');
      setMessage({ tone: 'ok', text: 'Code sent. Check WhatsApp on that number.' });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Could not send the code.',
      });
    }
    setBusy(false);
  }

  async function confirm() {
    setBusy(true);
    setMessage(null);
    try {
      await apiPost('/restaurant/whatsapp/confirm', { whatsappNumber: phone, code });
      setStage('idle');
      setCode('');
      setMessage({ tone: 'ok', text: 'Verified. This number will now receive your orders.' });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Could not verify that code.',
      });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-ny-card border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold tracking-tight">
            Order destination
          </h2>
          <StatusBadge status={status} />
        </div>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          Orders are sent to this WhatsApp number. An unverified number receives nothing.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="9801234567"
            aria-label="WhatsApp number"
            className="min-w-0 flex-1 rounded-ny border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={request}
            disabled={busy || phone.trim().length < 7}
            className="rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {status === 'VERIFIED' ? 'Change number' : 'Send code'}
          </button>
        </div>

        {stage === 'code' && (
          <div className="mt-4 rounded-ny border border-accent-border bg-accent-soft p-4">
            <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-ink-hi">
              Enter the 6-digit code
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="otp"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="______"
                className="w-full rounded-ny border border-line bg-surface px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.5em] focus:border-accent focus:outline-none sm:w-48"
              />
              <button
                type="button"
                onClick={confirm}
                disabled={busy || code.length !== 6}
                className="rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                Verify
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-label">
              The code expires in 10 minutes. Five wrong attempts and you&rsquo;ll need a new one.
            </p>
          </div>
        )}

        {message && (
          <p
            role="status"
            className={`mt-3 text-sm ${message.tone === 'ok' ? 'text-success' : 'text-danger'}`}
          >
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' }) {
  const tones = {
    VERIFIED: 'bg-success-soft text-success',
    PENDING: 'bg-warning-soft text-warning',
    UNVERIFIED: 'bg-danger-soft text-danger',
  } as const;
  return (
    <span className={`rounded-ny-pill px-2.5 py-1 text-[11px] font-bold ${tones[status]}`}>
      {status}
    </span>
  );
}
