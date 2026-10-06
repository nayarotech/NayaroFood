import { fetchTenant } from '@/lib/dashboard-api';
import { ZoneEditor } from '@/components/zone-editor';
import type { DeliveryZoneRule } from '@/lib/types';

export const metadata = { title: 'Delivery zones' };
export const dynamic = 'force-dynamic';

export default async function ZonesPage() {
  const zones = await fetchTenant<DeliveryZoneRule[]>('/restaurant/delivery-zones');

  return (
    <div>
      <header className="mb-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">Delivery zones</h2>
        <p className="mt-1 text-sm text-ink-muted">
          You set your own price by distance. Customers outside every band cannot order at all.
        </p>
      </header>

      {zones ? (
        <ZoneEditor initial={zones} />
      ) : (
        <p className="rounded-ny-card border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-muted">
          Couldn&rsquo;t load your delivery zones.
        </p>
      )}
    </div>
  );
}
