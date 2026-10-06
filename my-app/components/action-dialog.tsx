'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * Confirmation modal for consequential actions, optionally asking for a reason.
 *
 * Built on the native <dialog>, which gives focus trapping, Escape to close
 * and an inert background for free — and replaces `window.prompt`, which some
 * browsers block and nobody can style.
 */
export function ActionDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  reason,
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** When set, a reason textarea is shown and required. */
  reason?: { label: string; placeholder?: string; suggestions?: string[] };
  busy?: boolean;
  error?: string | null;
  onConfirm: (reason: string | undefined) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setText('');
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const needsReason = Boolean(reason);
  const valid = !needsReason || text.trim().length >= 3;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-ny-card border border-line bg-surface p-0 text-ink shadow-[var(--ny-shadow-card-hover)] backdrop:bg-[rgba(10,17,36,0.45)] backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || busy) return;
          onConfirm(needsReason ? text.trim() : undefined);
        }}
        className="p-5"
      >
        <h2 id={`${id}-title`} className="font-display text-lg font-bold tracking-tight">
          {title}
        </h2>
        {description && <div className="mt-1.5 text-sm text-ink-muted">{description}</div>}

        {reason && (
          <div className="mt-4">
            <label htmlFor={`${id}-reason`} className="mb-1 block text-sm font-medium text-ink-hi">
              {reason.label}
            </label>
            {reason.suggestions && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {reason.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setText(suggestion)}
                    className="rounded-ny-pill border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <textarea
              id={`${id}-reason`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              maxLength={300}
              required
              autoFocus
              placeholder={reason.placeholder}
              className="w-full rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-ink-label tabular-nums">{text.length}/300</p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-ny border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className={`rounded-ny px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              tone === 'danger'
                ? 'bg-danger text-white hover:opacity-90'
                : 'bg-accent text-on-accent hover:bg-accent-hover'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
