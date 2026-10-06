import Link from 'next/link';

/**
 * Placeholder for a route that is linked from the shell but not yet built.
 * Replaced as each phase lands — it exists so navigation is never a dead end.
 */
export function ComingSoon({
  title,
  body,
  phase,
}: {
  title: string;
  body: string;
  phase: string;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-3 px-4 py-16">
      <span className="rounded-ny-pill bg-accent-pill px-2.5 py-0.5 text-xs font-medium text-accent-label">
        {phase}
      </span>
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-[15px] text-ink-muted">{body}</p>
      <Link
        href="/"
        className="mt-2 rounded-ny bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
      >
        Browse restaurants
      </Link>
    </div>
  );
}
