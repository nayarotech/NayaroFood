import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ApiError, apiGetPaged } from '@/lib/api';
import { RestaurantCard } from '@/components/restaurant-card';
import { SearchControls } from '@/components/search-controls';
import type { RestaurantSummary } from '@/lib/types';
import type { HomeContent } from '@nayaro/shared';
import { getSite } from '@/lib/site';
import { HomeSections } from '@/components/site/home-sections';

/** Browse is personalised by the location in the URL, so it renders per request. */
export const dynamic = 'force-dynamic';


export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const lat = typeof params.lat === 'string' ? params.lat : undefined;
  const lng = typeof params.lng === 'string' ? params.lng : undefined;

  // Edited by the Super Admin under Site content; FALLBACK covers an API outage.
  const home = (await getSite())?.home ?? FALLBACK;
  const [mainPhoto, ...smallPhotos] = home.photos;

  return (
    <div>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[1.1fr_400px] lg:gap-12 lg:py-14">
          <div className="min-w-0">
            {home.hero.badge && <p className="text-sm font-medium text-accent-label">{home.hero.badge}</p>}

            <h1 className="mt-4 max-w-[14ch] font-display text-4xl leading-[1.05] font-bold tracking-tight text-ink sm:text-5xl">
              {home.hero.titleStart}{' '}
              {home.hero.titleHighlight && (
                <span className="text-accent">{home.hero.titleHighlight}</span>
              )}{' '}
              {home.hero.titleEnd}
            </h1>

            {home.hero.subtitle && (
              <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted">{home.hero.subtitle}</p>
            )}

            <div className="mt-7 max-w-xl">
              <Suspense fallback={<div className="h-12 animate-pulse rounded-ny bg-surface-muted" />}>
                <SearchControls initialQuery={query} />
              </Suspense>
            </div>

          </div>

          {mainPhoto && (
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <figure className="relative col-span-3 overflow-hidden rounded-ny-card shadow-[var(--ny-shadow-card-hover)]">
                <SitePhoto photo={mainPhoto} priority sizes="(min-width: 1024px) 340px, 100vw" className="aspect-[16/10] w-full object-cover" />
                {(home.heroCaption.title || home.heroCaption.body) && (
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-10 pb-3 text-white">
                    {home.heroCaption.title && <p className="font-display text-base font-semibold tracking-tight">{home.heroCaption.title}</p>}
                    {home.heroCaption.body && <p className="text-xs text-white/80">{home.heroCaption.body}</p>}
                  </figcaption>
                )}
              </figure>
              {smallPhotos.slice(0, 3).map((photo) => (
                <figure key={photo.url} className="relative overflow-hidden rounded-ny-card shadow-[var(--ny-shadow-card)]">
                  <SitePhoto photo={photo} sizes="(min-width: 1024px) 110px, 33vw" className="aspect-square w-full object-cover" />
                  {photo.label && (
                    <figcaption className="absolute bottom-1.5 left-1.5 rounded-ny-pill bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                      {photo.label}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-8 pb-10">
        <Suspense key={`${query}-${lat}-${lng}`} fallback={<GridSkeleton />}>
          <RestaurantGrid query={query} lat={lat} lng={lng} />
        </Suspense>
      </section>

      <HomeSections sections={home.sections} />
    </div>
  );
}

/** Bundled photos go through next/image; uploaded ones are plain <img> (any host). */
function SitePhoto({
  photo,
  className,
  sizes,
  priority = false,
}: {
  photo: { url: string; alt: string };
  className: string;
  sizes: string;
  priority?: boolean;
}) {
  if (photo.url.startsWith('/')) {
    return <Image src={photo.url} alt={photo.alt} width={900} height={675} sizes={sizes} priority={priority} className={className} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={photo.url} alt={photo.alt} loading={priority ? 'eager' : 'lazy'} className={className} />;
}

/** Shown only if the site-content API cannot be reached. */
const FALLBACK: HomeContent = {
  hero: {
    badge: '',
    titleStart: 'Food from local kitchens,',
    titleHighlight: 'delivered',
    titleEnd: 'to your door.',
    subtitle: 'Share your location to see which restaurants deliver to you and what it costs.',
  },
  photos: [{ url: '/images/home/handoff.jpg', alt: 'A food delivery at a customer’s door', label: '' }],
  heroCaption: { title: '', body: '' },
  sections: [],
};

async function RestaurantGrid({
  query,
  lat,
  lng,
}: {
  query: string;
  lat: string | undefined;
  lng: string | undefined;
}) {
  const search = new URLSearchParams();
  if (query) search.set('search', query);
  if (lat && lng) {
    search.set('latitude', lat);
    search.set('longitude', lng);
  }
  const locationSuffix = lat && lng ? `?lat=${lat}&lng=${lng}` : '';

  let items: RestaurantSummary[];
  try {
    ({ items } = await apiGetPaged<RestaurantSummary>(
      `/public/restaurants${search.toString() ? `?${search}` : ''}`,
      { cache: 'no-store' },
    ));
  } catch (error) {
    return (
      <EmptyState
        title="Couldn’t load restaurants"
        body={
          error instanceof ApiError && error.code === 'NETWORK_ERROR'
            ? 'We can’t reach our servers right now. Please try again in a moment.'
            : 'Something went wrong on our side. Please try again.'
        }
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={query ? `Nothing matches “${query}”` : 'No restaurants yet'}
        body={
          query
            ? 'Try another dish, cuisine or restaurant name.'
            : 'Kitchens are still being onboarded. Check back soon.'
        }
        action={query ? { label: 'Clear search', href: '/' } : undefined}
      />
    );
  }

  // With a location set, the kitchens that can actually reach you come first.
  const sorted = [...items].sort((a, b) => {
    const rank = (r: RestaurantSummary) =>
      r.delivery === null ? 1 : r.delivery.deliverable ? 0 : 2;
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
    return a.name.localeCompare(b.name);
  });

  // One chip per cuisine, whatever case each restaurant typed it in.
  const cuisineMap = new Map<string, string>();
  for (const name of sorted.flatMap((r) => r.categories)) {
    const key = name.trim().toLowerCase();
    if (key && !cuisineMap.has(key)) cuisineMap.set(key, name.trim().replace(/^./, (c) => c.toUpperCase()));
  }
  const cuisines = [...cuisineMap.values()].slice(0, 12);
  const deliverable = sorted.filter((r) => r.delivery?.deliverable).length;

  return (
    <>
      {cuisines.length > 0 && !query && (
        <nav aria-label="Browse by cuisine" className="-mx-4 mb-6 overflow-x-auto px-4 pb-1">
          <ul className="flex w-max gap-2">
            {cuisines.map((cuisine) => (
              <li key={cuisine}>
                <Link
                  href={`/?q=${encodeURIComponent(cuisine)}${lat && lng ? `&lat=${lat}&lng=${lng}` : ''}`}
                  className="block rounded-ny-pill border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-hi transition-colors hover:border-line-strong"
                >
                  {cuisine}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {query ? (
            <>
              Results for “{query}”
            </>
          ) : lat && lng ? (
            'Delivering to you'
          ) : (
            'All restaurants'
          )}
        </h2>
        <p className="text-sm text-ink-label">
          {lat && lng ? (
            <>
              <span className="font-medium text-ink">{deliverable}</span> of {sorted.length} can
              reach you
            </>
          ) : (
            `${sorted.length} restaurant${sorted.length === 1 ? '' : 's'}`
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((restaurant) => (
          <RestaurantCard key={restaurant.id} restaurant={restaurant} locationQuery={locationSuffix} />
        ))}
      </div>
    </>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="h-56 animate-pulse rounded-ny-card border border-line bg-surface-muted" />
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="rounded-ny-card border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">{body}</p>
      {action && (
        <Link
          href="/"
          className="mt-5 inline-block rounded-ny bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
