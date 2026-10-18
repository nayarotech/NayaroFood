'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useEventStream } from '@/lib/use-event-stream';
import { playChime, primeAudio, soundEnabled } from '@/lib/chime';

/** Keeps the rider's list current: new assignments chime and appear without a refresh. */
export function RiderLive() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, 300);
  }, [router]);

  useEffect(() => primeAudio(), []);

  const state = useEventStream(
    '/rider/events',
    {
      'order.assigned': () => {
        if (soundEnabled()) playChime();
        refresh();
      },
      'order.unassigned': refresh,
      'order.status': refresh,
    },
    { onReconnect: refresh, onGone: () => router.refresh() },
  );

  return (
    <p className="mb-3 inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <span className={`size-2 rounded-full ${state === 'live' ? 'bg-success' : 'bg-warning'}`} aria-hidden />
      {state === 'live' ? 'Connected' : 'Connecting…'}
    </p>
  );
}
