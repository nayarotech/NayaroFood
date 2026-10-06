'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiPut } from '@/lib/api';
import { ZoneRings } from '@/components/zone-rings';
import type { DeliveryZoneRule } from '@/lib/types';

interface DraftZone {
  key: string;
  id?: number;
  minDistanceKm: number;
  maxDistanceKm: number;
  /** Major units, as typed. Converted at submit. */
  deliveryFee: number;
  isActive: boolean;
}

/**
 * Delivery zone editor.
 *
 * Bands are half-open — [min, max) — so 5.00 km belongs to the 5–10 band, not
 * 0–5. The row labels say "under N km" rather than "N km" so that rule is
 * visible rather than something a restaurant discovers from a complaint.
 *
 * Overlap is checked here for instant feedback and again on the server, which
 * is the authority.
 */
export function ZoneEditor({ initial }: { initial: DeliveryZoneRule[] }) {
  const router = useRouter();
  const [zones, setZones] = useState<DraftZone[]>(() =>
    initial.map((zone, index) => ({
      key: `saved-${zone.id}-${index}`,
      id: zone.id,
      minDistanceKm: zone.minDistanceKm,
      maxDistanceKm: zone.maxDistanceKm,
      deliveryFee: zone.feeMinor / 100,
      isActive: zone.isActive,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const sorted = useMemo(
    () => [...zones].sort((a, b) => a.minDistanceKm - b.minDistanceKm),
    [zones],
  );

  const problems = useMemo(() => {
    const issues: string[] = [];
    const active = sorted.filter((z) => z.isActive);
    for (const zone of zones) {
      if (zone.maxDistanceKm <= zone.minDistanceKm) {
        issues.push(`A zone ends at ${zone.maxDistanceKm} km but starts at ${zone.minDistanceKm} km.`);
      }
      if (zone.deliveryFee < 0) issues.push('Fees cannot be negative.');
    }
    for (let i = 1; i < active.length; i += 1) {
      const previous = active[i - 1]!;
      const current = active[i]!;
      if (current.minDistanceKm < previous.maxDistanceKm) {
        issues.push(
          `${previous.minDistanceKm}–${previous.maxDistanceKm} km overlaps ${current.minDistanceKm}–${current.maxDistanceKm} km.`,
        );
      } else if (current.minDistanceKm > previous.maxDistanceKm) {
        issues.push(
          `Nobody between ${previous.maxDistanceKm} km and ${current.minDistanceKm} km can order.`,
        );
      }
    }
    return [...new Set(issues)];
  }, [sorted, zones]);

  const blocking = problems.filter((p) => !p.startsWith('Nobody between'));

  const preview: DeliveryZoneRule[] = sorted.map((zone, index) => ({
    id: zone.id ?? -(index + 1),
    name: null,
    minDistanceKm: zone.minDistanceKm,
    maxDistanceKm: zone.maxDistanceKm,
    feeMinor: Math.round(zone.deliveryFee * 100),
    isActive: zone.isActive,
  }));

  function update(key: string, patch: Partial<DraftZone>) {
    setZones((current) => current.map((zone) => (zone.key === key ? { ...zone, ...patch } : zone)));
  }

  function addZone() {
    const furthest = sorted.at(-1);
    const start = furthest ? furthest.maxDistanceKm : 0;
    setZones((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        minDistanceKm: start,
        maxDistanceKm: start + 5,
        deliveryFee: 0,
        isActive: true,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await apiPut('/restaurant/delivery-zones', {
        zones: sorted.map((zone) => ({
          ...(zone.id ? { id: zone.id } : {}),
          minDistanceKm: zone.minDistanceKm,
          maxDistanceKm: zone.maxDistanceKm,
          deliveryFee: zone.deliveryFee,
          isActive: zone.isActive,
        })),
      });
      setMessage({ tone: 'ok', text: 'Delivery zones saved.' });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Could not save your zones.',
      });
    }
    setSaving(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="overflow-hidden rounded-ny-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-muted text-left text-xs text-ink-label">
                <th className="px-3 py-2 font-medium">From (km)</th>
                <th className="px-3 py-2 font-medium">Under (km)</th>
                <th className="px-3 py-2 font-medium">Fee (Rs.)</th>
                <th className="px-3 py-2 font-medium">Active</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-ink-muted">
                    No zones yet. Customers cannot order until you add at least one.
                  </td>
                </tr>
              ) : (
                sorted.map((zone) => (
                  <tr key={zone.key} className="border-b border-line-soft last:border-0">
                    <td className="px-3 py-2">
                      <NumberInput
                        value={zone.minDistanceKm}
                        onChange={(value) => update(zone.key, { minDistanceKm: value })}
                        aria-label="Minimum distance in km"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <NumberInput
                        value={zone.maxDistanceKm}
                        onChange={(value) => update(zone.key, { maxDistanceKm: value })}
                        aria-label="Maximum distance in km"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <NumberInput
                        value={zone.deliveryFee}
                        onChange={(value) => update(zone.key, { deliveryFee: value })}
                        aria-label="Delivery fee"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={zone.isActive}
                        onChange={(event) => update(zone.key, { isActive: event.target.checked })}
                        aria-label="Zone is active"
                        className="size-4 accent-[var(--ny-accent)]"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setZones((c) => c.filter((z) => z.key !== zone.key))}
                        aria-label="Remove zone"
                        className="rounded-ny px-2 py-1 text-xs text-ink-label transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addZone}
            className="rounded-ny border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label"
          >
            + Add zone
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || blocking.length > 0}
            className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save zones'}
          </button>
          {message && (
            <span role="status" className={`text-sm ${message.tone === 'ok' ? 'text-success' : 'text-danger'}`}>
              {message.text}
            </span>
          )}
        </div>

        {problems.length > 0 && (
          <ul className="mt-3 space-y-1">
            {problems.map((problem) => (
              <li
                key={problem}
                className={`rounded-ny px-3 py-2 text-xs ${
                  problem.startsWith('Nobody between')
                    ? 'bg-warning-soft text-warning'
                    : 'bg-danger-soft text-danger'
                }`}
              >
                {problem}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs leading-relaxed text-ink-label">
          Bands are half-open: a customer at exactly 5 km falls into the 5–10 band, not 0–5. The
          furthest band&rsquo;s upper limit is where delivery stops entirely.
        </p>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-ny-card border border-line bg-surface p-4">
          <h2 className="font-display text-sm font-semibold tracking-tight">Live preview</h2>
          <p className="mt-0.5 mb-3 text-xs text-ink-label">How your delivery area looks.</p>
          {preview.length > 0 ? (
            <div className="flex justify-center">
              <ZoneRings zones={preview} size={220} />
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">Add a zone to see it here.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

// `value` and `onChange` are re-typed as numbers, so the native versions must
// be omitted from the spread or they collide.
function NumberInput({
  value,
  onChange,
  ...rest
}: { value: number; onChange: (value: number) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  return (
    <input
      type="number"
      min={0}
      step="0.5"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-24 rounded-ny border border-line bg-surface px-2 py-1.5 text-sm tabular-nums focus:border-accent focus:outline-none"
      {...rest}
    />
  );
}
