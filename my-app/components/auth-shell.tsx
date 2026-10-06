import Link from 'next/link';

/** Two-column auth layout: form on the left, brand reassurance on the right. */
export function AuthShell({
  title,
  subtitle,
  children,
  aside,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 lg:grid-cols-[1fr_340px] lg:py-16">
      <div className="min-w-0 max-w-lg">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 mb-7 text-[15px] text-ink-muted">{subtitle}</p>
        {children}
      </div>

      {aside && (
        <aside
          className="hidden h-fit rounded-ny-card p-6 text-white shadow-[var(--ny-shadow-accent)] lg:block"
          style={{ backgroundImage: 'var(--ny-accent-gradient)' }}
        >
          {aside}
        </aside>
      )}
    </div>
  );
}

export function AsideList({ heading, items }: { heading: string; items: string[] }) {
  return (
    <>
      <p className="font-display text-base font-semibold tracking-tight">{heading}</p>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm text-white/85">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/70" />
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-6 border-t border-white/20 pt-4 text-xs text-white/70">
        Your delivery pricing, menu and orders stay private to your restaurant.{' '}
        <Link href="/" className="underline underline-offset-2">
          Browse the platform
        </Link>
      </p>
    </>
  );
}
