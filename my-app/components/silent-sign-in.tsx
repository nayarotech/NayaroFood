'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { apiGet, refreshSession } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';


/**
 * Someone whose 15-minute access cookie lapsed still has a valid refresh
 * cookie. Before showing them a password form, try to restore the session
 * silently and send them back where they were.
 */
export function SilentSignIn({ next, children }: { next?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (await refreshSession()) {
        try {
          const me = await apiGet<{ user: { role: string } }>('/auth/me');
          if (cancelled) return;
          const fallback = me.user.role === 'SUPER_ADMIN' ? '/admin' : '/dashboard';
          router.replace((safeNext(next) ?? fallback) as Route);
          router.refresh();
          return;
        } catch {
          // Fall through to the form.
        }
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  if (checking) {
    return (
      <p role="status" className="py-10 text-center text-sm text-ink-muted">
        Checking your session…
      </p>
    );
  }
  return <>{children}</>;
}
