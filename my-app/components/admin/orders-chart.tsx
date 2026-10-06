'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/format';

export interface DayPoint {
  date: string;
  orders: number;
  gmvMinor: number;
}

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** A "nice" axis ceiling: 1, 2, 5 × 10ⁿ, at least 4 so a quiet week still has gridlines. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * magnitude) return step * magnitude;
  return 10 * magnitude;
}

/**
 * Orders per day. One series, so no legend — the panel title names it.
 * Bars carry the count; the hover tooltip adds delivered value, which has a
 * different scale and so never gets a second axis.
 */
export function OrdersChart({ data }: { data: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.orders)));
  const ticks = [0, max / 2, max];
  const total = data.reduce((sum, d) => sum + d.orders, 0);

  // Geometry in viewBox units; the SVG scales to its container.
  const width = 640;
  const height = 200;
  const left = 32;
  const bottom = 22;
  const top = 8;
  const plotW = width - left - 4;
  const plotH = height - bottom - top;
  const slot = plotW / data.length;
  const barW = Math.max(4, slot - 6);
  const y = (value: number) => top + plotH - (value / max) * plotH;

  const active = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img"
          aria-label={`Orders per day for the last ${data.length} days, ${total} in total.`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={left} x2={width - 4} y1={y(tick)} y2={y(tick)}
                stroke="var(--ny-border)" strokeWidth={1} strokeDasharray={tick === 0 ? undefined : '3 3'} />
              <text x={left - 6} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--ny-foreground-label)"
                className="tabular-nums">
                {Number.isInteger(tick) ? tick : tick.toFixed(1)}
              </text>
            </g>
          ))}

          {data.map((point, index) => {
            const x = left + index * slot + (slot - barW) / 2;
            const barTop = y(point.orders);
            const h = top + plotH - barTop;
            const r = Math.min(4, barW / 2, h);
            const showLabel = (data.length - 1 - index) % 3 === 0;
            return (
              <g key={point.date}>
                {point.orders > 0 && (
                  // Rounded data-end, square at the baseline.
                  <path
                    d={`M${x},${top + plotH} V${barTop + r} Q${x},${barTop} ${x + r},${barTop} H${x + barW - r} Q${x + barW},${barTop} ${x + barW},${barTop + r} V${top + plotH} Z`}
                    fill="var(--ny-accent)"
                    opacity={hover === null || hover === index ? 1 : 0.45}
                  />
                )}
                {showLabel && (
                  <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--ny-foreground-label)">
                    {DAY_LABEL.format(new Date(`${point.date}T00:00:00Z`))}
                  </text>
                )}
                {/* Hit target: the whole column, not just the bar. */}
                <rect x={left + index * slot} y={top} width={slot} height={plotH} fill="transparent"
                  onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(index)} onBlur={() => setHover(null)} tabIndex={0}
                  aria-label={`${point.date}: ${point.orders} orders`} />
              </g>
            );
          })}
        </svg>

        {active && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-ny border border-line bg-surface px-3 py-2 text-xs shadow-[var(--ny-shadow-card-hover)]"
            style={{ left: `${((left + hover * slot + slot / 2) / width) * 100}%` }}
          >
            <p className="font-semibold text-ink">{WEEKDAY.format(new Date(`${active.date}T00:00:00Z`))}</p>
            <p className="mt-0.5 text-ink-muted tabular-nums">
              <span className="font-semibold text-ink">{active.orders}</span> orders
            </p>
            <p className="text-ink-muted tabular-nums">{formatMoney(active.gmvMinor)} delivered</p>
          </div>
        )}
      </div>

      <details className="mt-2 text-xs text-ink-muted">
        <summary className="cursor-pointer select-none hover:text-ink">Show as table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr className="text-ink-label">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Orders</th>
              <th className="py-1 text-right font-medium">Delivered value</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.date} className="border-t border-line-soft">
                <td className="py-1">{WEEKDAY.format(new Date(`${point.date}T00:00:00Z`))}</td>
                <td className="py-1 text-right">{point.orders}</td>
                <td className="py-1 text-right">{formatMoney(point.gmvMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
