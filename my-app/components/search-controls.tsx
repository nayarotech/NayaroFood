'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Search box plus "use my location".
 *
 * Both write to the URL rather than to component state, so a result page is
 * shareable, survives a refresh, and is rendered on the server.
 */
export function SearchControls({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const hasLocation = searchParams.has('lat') && searchParams.has('lng');

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    startTransition(() => {
      router.push(params.toString() ? `/?${params}` : '/');
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    pushParams((params) => {
      if (query.trim()) params.set('q', query.trim());
      else params.delete('q');
    });
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setLocationError('This browser cannot share your location.');
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        pushParams((params) => {
          params.set('lat', position.coords.latitude.toFixed(7));
          params.set('lng', position.coords.longitude.toFixed(7));
        });
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission denied. You can still browse and set an address at checkout.'
            : 'Could not get your location. Please try again.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function clearLocation() {
    pushParams((params) => {
      params.delete('lat');
      params.delete('lng');
    });
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form onSubmit={onSubmit} className="flex min-w-0 flex-1 gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search food or restaurant…"
            aria-label="Search food or restaurant"
            className="min-w-0 flex-1 rounded-ny border border-line bg-surface px-4 py-3 text-sm text-ink shadow-[var(--ny-shadow-card)] transition-colors placeholder:text-ink-label focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-ny bg-accent px-5 py-3 text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            Search
          </button>
        </form>

        {hasLocation ? (
          <button
            type="button"
            onClick={clearLocation}
            className="rounded-ny border border-accent-border bg-accent-soft px-4 py-3 text-sm font-medium text-accent-label transition-colors hover:bg-accent-pill"
          >
            Location set · Clear
          </button>
        ) : (
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="rounded-ny border border-line bg-surface px-4 py-3 text-sm font-medium text-ink-muted shadow-[var(--ny-shadow-card)] transition-colors hover:border-accent-border hover:text-accent-label disabled:opacity-60"
          >
            {locating ? 'Locating…' : 'Use my location'}
          </button>
        )}
      </div>

      {locationError && (
        <p role="status" className="mt-2 text-xs text-danger">
          {locationError}
        </p>
      )}
      {!locationError && !hasLocation && (
        <p className="mt-2 text-xs text-ink-label">
          Share your location to see exact delivery fees and which restaurants reach you.
        </p>
      )}
    </div>
  );
}
