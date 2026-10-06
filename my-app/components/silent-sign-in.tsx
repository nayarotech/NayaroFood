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
/**
 * If we restore a session and are bounced straight back here, the website's
 * server can't see the sign-in cookie (usually COOKIE_DOMAIN doesn't cover
 * this site). Redirecting again would loop forever, so stop and say so.
 */
const BOUNCE_KEY = 'nayaro.signin-bounce';
const BOUNCE_WINDOW_MS = 20_000;

function recordBounce(): number {
  try {
    const previous = JSON.parse(window.sessionStorage.getItem(BOUNCE_KEY) ?? 'null') as { at: number; count: number } | null;
    const count = previous && Date.now() - previous.at < BOUNCE_WINDOW_MS ? previous.count + 1 : 1;
    window.sessionStorage.setItem(BOUNCE_KEY, JSON.stringify({ at: Date.now(), count }));
    return count;
  } catch {
    return 1;
  }
}

export function SilentSignIn({ next, children }: { next?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [looping, setLooping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (await refreshSession()) {
        try {
          const me = await apiGet<{ user: { role: string } }>('/auth/me');
          if (cancelled) return;
          if (recordBounce() >= 3) {
            setLooping(true);
            setChecking(false);
            return;
          }
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

  if (looping) {
    return (
      <div role="alert" className="rounded-ny-card border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
        <p className="font-semibold">You&rsquo;re signed in, but this website can&rsquo;t see your session.</p>
        <p className="mt-1">
          The sign-in cookie isn&rsquo;t reaching this site. On the server, <code>COOKIE_DOMAIN</code> must be the parent
          domain this website and the API share (for example <code>.example.com</code>), and you must open the site on that
          domain — not on a <code>vercel.app</code> address.
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              window.sessionStorage.removeItem(BOUNCE_KEY);
            } catch {
              // ignore
            }
            setLooping(false);
          }}
          className="mt-3 font-semibold underline"
        >
          Show the sign-in form
        </button>
      </div>
    );
  }

  if (checking) {
    return (
      <p role="status" className="py-10 text-center text-sm text-ink-muted">
        Checking your session…
      </p>
    );
  }
  return <>{children}</>;
}
