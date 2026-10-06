export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  const tones = {
    default: 'text-ink',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    accent: 'text-accent',
  } as const;
  return (
    <div className="rounded-ny-card border border-line bg-surface p-4 shadow-[var(--ny-shadow-card)]">
      <dt className="text-xs font-medium text-ink-label">{label}</dt>
      <dd className={`mt-1 font-display text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-ink-subtle">{hint}</dd>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  flush = false,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="rounded-ny-card border border-line bg-surface shadow-[var(--ny-shadow-card)]">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
        <h2 className="font-display text-sm font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-ny-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-ink-muted">
      {children}
    </p>
  );
}
