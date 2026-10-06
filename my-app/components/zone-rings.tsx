import { formatDeliveryFee } from '@/lib/format';
import type { DeliveryQuote, DeliveryZoneRule } from '@/lib/types';

/**
 * The delivery map, drawn as concentric rings.
 *
 * This is the one place the platform's core idea becomes visible: a restaurant
 * charges by distance band, and the customer can see exactly which band they
 * fall into and where the coverage stops. Free bands read strongest; the fee
 * rises as the rings fade outward.
 */
export function ZoneRings({
  zones,
  quote,
  size = 240,
  variant = 'default',
}: {
  zones: DeliveryZoneRule[];
  quote?: DeliveryQuote | null;
  size?: number;
  /** `onAccent` draws in white, for use inside a saturated blue panel. */
  variant?: 'default' | 'onAccent';
}) {
  const onAccent = variant === 'onAccent';
  const ringColor = onAccent ? '#ffffff' : 'var(--ny-accent)';
  const axisColor = onAccent ? 'rgba(255,255,255,0.45)' : 'var(--ny-border-strong)';
  const labelClass = onAccent
    ? 'fill-white/75 font-mono text-[9px]'
    : 'fill-[var(--ny-foreground-label)] font-mono text-[9px]';
  const active = zones.filter((z) => z.isActive).sort((a, b) => a.minDistanceKm - b.minDistanceKm);
  if (active.length === 0) return null;

  const coverageKm = Math.max(...active.map((z) => z.maxDistanceKm));
  const customerKm = quote ? quote.distanceKm : null;

  // Leave headroom when the customer sits outside coverage, so their marker is
  // still on canvas and the gap is legible rather than clipped.
  const scaleKm =
    customerKm !== null && customerKm > coverageKm ? Math.min(customerKm * 1.12, coverageKm * 3) : coverageKm;

  const center = size / 2;
  const maxRadius = center - 22;
  const toRadius = (km: number) => (km / scaleKm) * maxRadius;

  // Outermost first, so inner bands paint on top.
  const painted = [...active].reverse();
  const customerAngle = -Math.PI / 4;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[280px]"
        role="img"
        aria-label={
          customerKm !== null
            ? `Delivery zones. You are ${customerKm} kilometres from the restaurant.`
            : `Delivery zones, covering up to ${coverageKm} kilometres.`
        }
      >
        <defs>
          <radialGradient id="zr-core">
            <stop offset="0%" stopColor={ringColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={ringColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Out-of-range field, only drawn when the customer falls beyond coverage. */}
        {scaleKm > coverageKm && (
          <circle cx={center} cy={center} r={maxRadius} fill="var(--ny-danger)" opacity="0.05" />
        )}

        {painted.map((zone) => {
          const share = zone.feeMinor === 0 ? 1 : 0.55 - Math.min(zone.feeMinor / 20000, 0.35);
          const isMatch = quote?.deliverable && quote.zone.id === zone.id;
          return (
            <g key={zone.id}>
              <circle
                cx={center}
                cy={center}
                r={toRadius(zone.maxDistanceKm)}
                fill={ringColor}
                fillOpacity={onAccent ? 0.1 * share + 0.06 : 0.12 * share + 0.07}
                stroke={ringColor}
                strokeOpacity={isMatch ? 0.95 : onAccent ? 0.55 : 0.4}
                strokeWidth={isMatch ? 2 : 1}
                strokeDasharray={isMatch ? undefined : '3 4'}
              />
            </g>
          );
        })}

        <circle cx={center} cy={center} r={maxRadius * 0.42} fill="url(#zr-core)" />

        <line
          x1={center}
          y1={center}
          x2={center + maxRadius}
          y2={center}
          stroke={axisColor}
          strokeWidth="1"
          strokeDasharray="2 3"
        />

        {/* Distance ticks. Labels are placed from the outermost band inward so
            the furthest reach is always shown; an inner label is dropped when it
            would collide with one already placed. */}
        {(() => {
          const MIN_GAP = 24;
          const placed: number[] = [];
          const labels: { radius: number; km: number; unit: boolean }[] = [];
          for (const zone of [...active].reverse()) {
            const radius = toRadius(zone.maxDistanceKm);
            if (placed.some((r) => Math.abs(r - radius) < MIN_GAP)) continue;
            placed.push(radius);
            labels.push({ radius, km: zone.maxDistanceKm, unit: labels.length === 0 });
          }
          return labels.map(({ radius, km, unit }) => (
            <g key={`tick-${km}`}>
              <line
                x1={center + radius}
                y1={center - 4}
                x2={center + radius}
                y2={center + 4}
                stroke={axisColor}
                strokeWidth="1"
              />
              <text x={center + radius} y={center + 16} textAnchor="middle" className={labelClass}>
                {km}
                {unit ? ' km' : ''}
              </text>
            </g>
          ));
        })()}

        {customerKm !== null && (
          <>
            <line
              x1={center}
              y1={center}
              x2={center + Math.cos(customerAngle) * toRadius(customerKm)}
              y2={center + Math.sin(customerAngle) * toRadius(customerKm)}
              stroke={quote?.deliverable ? ringColor : 'var(--ny-danger)'}
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <circle
              cx={center + Math.cos(customerAngle) * toRadius(customerKm)}
              cy={center + Math.sin(customerAngle) * toRadius(customerKm)}
              r="6"
              fill={quote?.deliverable ? ringColor : 'var(--ny-danger)'}
              stroke={onAccent ? 'var(--ny-accent-deep)' : 'var(--ny-surface)'}
              strokeWidth="2.5"
            />
            <text
              x={center + Math.cos(customerAngle) * toRadius(customerKm)}
              y={center + Math.sin(customerAngle) * toRadius(customerKm) - 12}
              textAnchor="middle"
              className={onAccent ? "fill-white font-mono text-[10px] font-medium" : "fill-[var(--ny-foreground)] font-mono text-[10px] font-medium"}
            >
              {customerKm} km
            </text>
          </>
        )}

        {/* The restaurant itself. */}
        <circle cx={center} cy={center} r="5.5" fill={onAccent ? "#ffffff" : "var(--ny-accent)"} />
        <circle
          cx={center}
          cy={center}
          r="10"
          fill="none"
          stroke={ringColor}
          strokeOpacity={onAccent ? 0.6 : 0.35}
          strokeWidth="1.5"
        />
      </svg>

      <figcaption className="sr-only">Delivery zones by distance from the restaurant.</figcaption>
    </figure>
  );
}

/** Compact fee table that pairs with the rings. */
export function ZoneLegend({
  zones,
  quote,
  variant = 'default',
}: {
  zones: DeliveryZoneRule[];
  quote?: DeliveryQuote | null;
  variant?: 'default' | 'onAccent';
}) {
  const onAccent = variant === 'onAccent';
  const active = zones.filter((z) => z.isActive).sort((a, b) => a.minDistanceKm - b.minDistanceKm);

  return (
    <ul className="space-y-px">
      {active.map((zone) => {
        const isMatch = quote?.deliverable && quote.zone.id === zone.id;
        return (
          <li
            key={zone.id}
            className={`flex items-center justify-between gap-3 rounded-ny px-2.5 py-1.5 text-sm ${
              onAccent
                ? isMatch
                  ? 'bg-white/20 font-semibold text-white'
                  : 'text-white/80'
                : isMatch
                  ? 'bg-accent-pill font-medium text-accent-label'
                  : 'text-ink-muted'
            }`}
          >
            <span className="tabular-nums">
              {zone.minDistanceKm}–{zone.maxDistanceKm} km
            </span>
            <span
              className={`tabular-nums ${
                zone.feeMinor === 0 && !isMatch
                  ? onAccent
                    ? 'font-semibold text-white'
                    : 'font-medium text-success'
                  : ''
              }`}
            >
              {formatDeliveryFee(zone.feeMinor)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
