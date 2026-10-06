'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL, refreshSession } from '@/lib/api';

export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'offline';

type Handlers = Record<string, (data: unknown) => void>;

/**
 * A Server-Sent Events subscription that survives the things that kill a plain
 * `EventSource` on a dashboard left open all day:
 *
 *   - The access cookie expires after 15 minutes. The browser's own reconnect
 *     then gets a 401, and `EventSource` gives up permanently on any non-200.
 *     Here a closed stream triggers a session refresh, then a fresh connection.
 *   - Laptop sleep / Wi-Fi drops: reconnects with capped exponential backoff,
 *     and immediately when the tab becomes visible or the network returns.
 *
 * `onGone` fires when the server refuses us for a reason a refresh cannot fix
 * (signed out, or the restaurant was blocked) so the page can re-render.
 */
export function useEventStream(
  path: string,
  handlers: Handlers,
  options: { onGone?: () => void; onReconnect?: () => void } = {},
): StreamState {
  const [state, setState] = useState<StreamState>('connecting');
  // Handlers change identity every render; the connection must not.
  const handlersRef = useRef(handlers);
  const optionsRef = useRef(options);
  useEffect(() => {
    handlersRef.current = handlers;
    optionsRef.current = options;
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;
    let everConnected = false;

    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(connect, delay);
    };

    function connect() {
      if (disposed) return;
      source?.close();
      source = new EventSource(`${API_URL}${path}`, { withCredentials: true });

      source.addEventListener('ready', () => {
        if (everConnected && attempt > 0) optionsRef.current.onReconnect?.();
        everConnected = true;
        attempt = 0;
        setState('live');
      });

      for (const name of Object.keys(handlersRef.current)) {
        source.addEventListener(name, (event) => {
          let data: unknown = null;
          try {
            data = JSON.parse((event as MessageEvent<string>).data);
          } catch {
            // A malformed frame is ignored rather than tearing down the stream.
          }
          handlersRef.current[name]?.(data);
        });
      }

      source.onerror = async () => {
        if (disposed || !source) return;
        // CONNECTING means the browser is already retrying a dropped connection.
        if (source.readyState === EventSource.CONNECTING) {
          setState('reconnecting');
          return;
        }
        // CLOSED: the server answered with an error status — usually an expired
        // session. Refresh it, then reconnect ourselves.
        source.close();
        setState('reconnecting');
        attempt += 1;
        const refreshed = await refreshSession();
        if (disposed) return;
        if (!refreshed && attempt >= 3) {
          setState('offline');
          optionsRef.current.onGone?.();
          return;
        }
        // Refreshed but still refused (e.g. 403 after a block): let the page
        // re-render once to show why, and keep retrying slowly behind it.
        if (attempt === 3) optionsRef.current.onGone?.();
        schedule(Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5)));
      };
    }

    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      if (!source || source.readyState === EventSource.CLOSED) {
        attempt = 0;
        schedule(0);
      }
    };

    connect();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      source?.close();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [path]);

  return state;
}
