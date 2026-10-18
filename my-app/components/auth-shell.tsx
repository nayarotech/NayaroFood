/** A single, focused card for sign-in and sign-up screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Restaurant sign-up has more fields; give it room for two columns. */
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto px-4 py-10 sm:py-16 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
      <div className="rounded-ny-card border border-line bg-surface p-6 shadow-[var(--ny-shadow-card)] sm:p-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-center text-sm text-ink-muted">{footer}</div>}
    </div>
  );
}
