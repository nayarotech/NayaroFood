'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * One-time-code field. A single input (not six boxes) so paste, autofill from
 * the email app (`autocomplete="one-time-code"`) and screen readers all work.
 */
export function CodeInput({
  value,
  onChange,
  length = 6,
  error,
  autoFocus = true,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  error?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor="one-time-code" className="mb-1 block text-sm font-medium text-ink-hi">
        Code
      </label>
      <input
        id="one-time-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length + 2}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, length))}
        aria-invalid={error ? true : undefined}
        placeholder={'•'.repeat(length)}
        className={`w-full rounded-ny border bg-surface px-3.5 py-3 text-center font-mono text-2xl tracking-[0.5em] focus:outline-none ${
          error ? 'border-danger' : 'border-line focus:border-accent'
        }`}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** "Resend code" with a visible countdown matching the server's cooldown. */
export function ResendButton({ onResend, cooldown = 60 }: { onResend: () => Promise<void>; cooldown?: number }) {
  const [left, setLeft] = useState(cooldown);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return (
    <button
      type="button"
      disabled={left > 0 || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onResend();
          setLeft(cooldown);
        } finally {
          setBusy(false);
        }
      }}
      className="text-sm font-medium text-accent-label hover:underline disabled:cursor-default disabled:text-ink-label disabled:no-underline"
    >
      {busy ? 'Sending…' : left > 0 ? `Resend code in ${left}s` : 'Resend code'}
    </button>
  );
}
