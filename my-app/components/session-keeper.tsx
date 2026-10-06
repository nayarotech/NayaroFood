'use client';

import { useEffect } from 'react';
import { refreshSession } from '@/lib/api';

/** Comfortably inside the 15-minute access-token lifetime. */
const EVERY_MS = 10 * 60_000;

/**
 * Keeps the access cookie fresh while a dashboard is open.
 *
 * Server components read that cookie on every navigation, and they cannot
 * refresh it themselves — the refresh cookie is scoped to the API's auth path,
 * so only the browser can present it. Without this, clicking a sidebar link
 * after 15 idle minutes would bounce a restaurant to the sign-in page.
 */
export function SessionKeeper() {
  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      if (Date.now() - last < EVERY_MS - 5_000) return;
      last = Date.now();
      void refreshSession();
    };
    const timer = setInterval(tick, EVERY_MS);
    // A laptop waking from sleep may have skipped several ticks.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last >= EVERY_MS) {
        last = Date.now();
        void refreshSession();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
