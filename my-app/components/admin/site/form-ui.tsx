'use client';

import Link from 'next/link';
import { useEffect, useId } from 'react';
import { ArrowUpRight } from 'lucide-react';

const inputClass =
  'w-full rounded-ny border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none';

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  maxLength,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  maxLength?: number;
  placeholder?: string;
  type?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 flex justify-between gap-2 text-sm font-medium text-ink-hi">
        <span>{label}</span>
        {maxLength && value.length > maxLength * 0.8 && (
          <span className="text-[11px] font-normal text-ink-label tabular-nums">{value.length}/{maxLength}</span>
        )}
      </label>
      <input id={id} type={type} value={value} maxLength={maxLength} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}
        className={`${inputClass} ${error ? 'border-danger' : 'border-line'}`} />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint && <p className="mt-1 text-xs text-ink-label">{hint}</p>}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  maxLength,
  hint,
  error,
  mono = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  hint?: string;
  error?: string;
  mono?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 flex justify-between gap-2 text-sm font-medium text-ink-hi">
        <span>{label}</span>
        {maxLength && <span className="text-[11px] font-normal text-ink-label tabular-nums">{value.length}/{maxLength}</span>}
      </label>
      <textarea id={id} value={value} rows={rows} maxLength={maxLength} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} ${error ? 'border-danger' : 'border-line'} ${mono ? 'font-mono text-[13px] leading-relaxed' : ''}`} />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint && <p className="mt-1 text-xs text-ink-label">{hint}</p>}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ny-accent)]" />
      <span>
        <span className="block text-sm font-medium text-ink-hi">{label}</span>
        {hint && <span className="block text-xs text-ink-label">{hint}</span>}
      </span>
    </label>
  );
}

export function EditorCard({ title, description, actions, children }: {
  title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-ny-card border border-line bg-surface p-5 shadow-[var(--ny-shadow-card)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function SmallButton({ children, danger = false, ...rest }: { children: React.ReactNode; danger?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button"
      className={`rounded-ny border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-35 ${
        danger ? 'border-danger/30 text-danger hover:bg-danger-soft' : 'border-line text-ink-muted hover:border-accent-border hover:text-accent-label'
      }`}
      {...rest}>
      {children}
    </button>
  );
}

/**
 * Sticky save bar: always reachable on a long editor, and makes unsaved
 * changes obvious.
 */
export function SaveBar({
  dirty, busy, notice, onSave, onReset, viewHref = '/',
}: {
  dirty: boolean;
  busy: boolean;
  notice: { tone: 'ok' | 'error'; text: string } | null;
  onSave: () => void;
  onReset?: () => void;
  viewHref?: string;
}) {
  return (
    <div className="sticky bottom-3 z-30 mt-6 flex flex-wrap items-center gap-3 rounded-ny-card border border-line bg-surface/95 px-4 py-3 shadow-[var(--ny-shadow-card-hover)] backdrop-blur">
      <button type="button" onClick={onSave} disabled={busy || !dirty}
        className="rounded-ny bg-accent px-5 py-2 text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] hover:bg-accent-hover disabled:opacity-50">
        {busy ? 'Saving…' : dirty ? 'Save & publish' : 'All changes saved'}
      </button>
      {dirty && !busy && <span className="text-xs font-medium text-warning">Unsaved changes</span>}
      {notice && (
        <span role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${notice.tone === 'ok' ? 'text-success' : 'text-danger'}`}>
          {notice.text}
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        {onReset && (
          <button type="button" onClick={onReset} disabled={busy} className="text-xs text-ink-label hover:text-danger disabled:opacity-50">
            Restore defaults
          </button>
        )}
        <Link href={viewHref as '/'} target="_blank" className="text-sm font-medium text-accent-label hover:underline">
          View site <ArrowUpRight aria-hidden className="inline size-3.5" />
        </Link>
      </span>
    </div>
  );
}

/** Warn before closing the tab with unsaved edits. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
