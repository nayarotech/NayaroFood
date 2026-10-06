'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { playChime, primeAudio, setSoundEnabled, soundEnabled } from '@/lib/chime';

/**
 * In-dashboard alerts: what happens when an order arrives while this page is
 * open. Stored per device, because the kitchen tablet and the owner's laptop
 * rarely want the same thing.
 */
export function LiveAlertSettings() {
  // Read straight from storage, so every open tab agrees on the setting.
  const sound = useSyncExternalStore(
    (onChange) => {
      window.addEventListener('nayaro:sound-pref', onChange);
      window.addEventListener('storage', onChange);
      return () => {
        window.removeEventListener('nayaro:sound-pref', onChange);
        window.removeEventListener('storage', onChange);
      };
    },
    soundEnabled,
    () => true,
  );

  useEffect(() => primeAudio(), []);

  return (
    <section className="rounded-ny-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold tracking-tight">Live order alerts</h2>
          <p className="mt-1 max-w-md text-sm text-ink-muted">
            While this dashboard is open, new orders appear instantly with a pop-up, the count in
            your browser tab, and a chime that repeats every 20 seconds until someone responds.
          </p>
        </div>
        <span className="rounded-ny-pill bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success">
          ALWAYS ON
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-hi">
          <input
            type="checkbox"
            checked={sound}
            onChange={(event) => setSoundEnabled(event.target.checked)}
            className="size-4 accent-[var(--ny-accent)]"
          />
          Play a sound on this device
        </label>
        <button
          type="button"
          onClick={() => playChime()}
          className="rounded-ny border border-line px-3.5 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label"
        >
          ▶ Test sound
        </button>
      </div>
      <p className="mt-3 text-xs text-ink-label">
        Browsers only allow sound after you click somewhere on the page once — do that when you
        open the dashboard at the start of a shift.
      </p>
    </section>
  );
}
