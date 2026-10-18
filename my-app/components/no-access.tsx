import { Lock } from 'lucide-react';

/** Shown on a dashboard page the signed-in team member isn't allowed to use. */
export function NoAccess({ what }: { what: string }) {
  return (
    <div className="rounded-ny-card border border-line bg-surface px-6 py-12 text-center">
      <Lock aria-hidden className="mx-auto size-6 text-ink-label" strokeWidth={1.75} />
      <p className="mt-3 font-medium">You don’t have access to {what}</p>
      <p className="mt-1 text-sm text-ink-muted">Ask the restaurant owner to give you permission.</p>
    </div>
  );
}
