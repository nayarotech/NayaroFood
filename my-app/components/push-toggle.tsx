'use client';

import { useEffect, useState } from 'react';
import {
  currentState,
  disablePush,
  enablePush,
  sendTestPush,
  type PushState,
} from '@/lib/push-client';

/**
 * Browser push notifications.
 *
 * This is the channel that works with the dashboard closed — the browser's
 * push service wakes the service worker and the OS shows the alert. The live
 * feed inside the dashboard is a separate stream that stops with the tab.
 */
export function PushToggle() {
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void currentState().then(setState);
  }, []);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not change notifications.');
    }
    setBusy(false);
  }

  return (
    <section className="rounded-ny-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold tracking-tight">
            Phone &amp; desktop alerts
          </h2>
          <p className="mt-1 max-w-md text-sm text-ink-muted">
            Get a notification the moment an order arrives — <strong>even when this dashboard
            is closed</strong>. Install this site to your home screen for alerts on your phone.
          </p>
        </div>
        {state !== 'loading' && state !== 'unsupported' && (
          <span
            className={`rounded-ny-pill px-2.5 py-1 text-[11px] font-bold ${
              state === 'on' ? 'bg-success-soft text-success' : 'bg-surface-muted text-ink-muted'
            }`}
          >
            {state === 'on' ? 'ON' : state === 'denied' ? 'BLOCKED' : 'OFF'}
          </span>
        )}
      </div>

      {state === 'unsupported' ? (
        <p className="mt-4 rounded-ny bg-surface-muted px-3 py-2 text-sm text-ink-muted">
          This browser doesn&rsquo;t support push notifications. Keep this dashboard open to get orders live.
        </p>
      ) : state === 'denied' ? (
        <p className="mt-4 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">
          Notifications are blocked for this site. Re-enable them in your browser&rsquo;s site
          settings, then reload.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggle}
            disabled={busy || state === 'loading'}
            className={`rounded-ny px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
              state === 'on'
                ? 'border border-line text-ink-muted hover:border-danger/40 hover:text-danger'
                : 'bg-accent text-on-accent shadow-[var(--ny-shadow-accent)] hover:bg-accent-hover'
            }`}
          >
            {busy ? 'Working…' : state === 'on' ? 'Turn off alerts' : 'Enable alerts'}
          </button>

          {state === 'on' && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMessage(null);
                try {
                  await sendTestPush();
                  setMessage('Test alert sent — it should appear shortly.');
                } catch {
                  setMessage('Could not send a test alert.');
                }
                setBusy(false);
              }}
              className="rounded-ny border border-line px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label"
            >
              Send test alert
            </button>
          )}
        </div>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          {message}
        </p>
      )}
    </section>
  );
}
