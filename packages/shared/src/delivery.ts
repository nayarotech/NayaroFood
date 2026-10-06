/**
 * Delivery zone matching.
 *
 * BOUNDARY CONTRACT — half-open intervals: [minDistanceKm, maxDistanceKm)
 *   min is INCLUSIVE, max is EXCLUSIVE.
 *
 * With zones 0-5 free, 5-10 Rs.10, 10-20 Rs.50:
 *   4.99 km -> free           5.00 km -> Rs. 10 (5 belongs to the 5-10 zone)
 *   9.99 km -> Rs. 10        10.00 km -> Rs. 50
 *   19.99 km -> Rs. 50       20.00 km -> UNDELIVERABLE (max is exclusive)
 *
 * Distances arrive already rounded to 2 decimals by `roundKm`, so a coordinate
 * pair can never straddle a boundary depending on who did the arithmetic.
 */

import { roundKm } from './geo.js';
import type { Minor } from './money.js';

export interface DeliveryZoneRule {
  readonly id: number;
  readonly name: string | null;
  readonly minDistanceKm: number;
  readonly maxDistanceKm: number;
  /** Fee in minor units (paisa). 0 means free delivery. */
  readonly feeMinor: Minor;
  readonly isActive: boolean;
}

export type DeliveryQuote =
  | {
      readonly deliverable: true;
      readonly distanceKm: number;
      readonly zone: DeliveryZoneRule;
      readonly feeMinor: Minor;
    }
  | {
      readonly deliverable: false;
      readonly distanceKm: number;
      readonly reason: UndeliverableReason;
      /** Furthest active max, so the UI can say "we deliver up to N km". */
      readonly maxSupportedKm: number | null;
    };

export const UndeliverableReason = {
  NO_ZONES_CONFIGURED: 'NO_ZONES_CONFIGURED',
  OUTSIDE_ALL_ZONES: 'OUTSIDE_ALL_ZONES',
} as const;
export type UndeliverableReason =
  (typeof UndeliverableReason)[keyof typeof UndeliverableReason];

/**
 * Resolve the fee for a distance. Inactive zones are ignored entirely.
 *
 * If validation was bypassed and zones do overlap, the LOWEST fee wins — a
 * deterministic, customer-favourable tie-break rather than list-order luck.
 */
export function matchDeliveryZone(
  distanceKmRaw: number,
  zones: readonly DeliveryZoneRule[],
): DeliveryQuote {
  const distanceKm = roundKm(distanceKmRaw);
  const active = zones.filter((z) => z.isActive);

  if (active.length === 0) {
    return {
      deliverable: false,
      distanceKm,
      reason: UndeliverableReason.NO_ZONES_CONFIGURED,
      maxSupportedKm: null,
    };
  }

  const matches = active.filter(
    (z) => distanceKm >= z.minDistanceKm && distanceKm < z.maxDistanceKm,
  );

  if (matches.length === 0) {
    return {
      deliverable: false,
      distanceKm,
      reason: UndeliverableReason.OUTSIDE_ALL_ZONES,
      maxSupportedKm: Math.max(...active.map((z) => z.maxDistanceKm)),
    };
  }

  const zone = matches.reduce((cheapest, candidate) => {
    if (candidate.feeMinor !== cheapest.feeMinor) {
      return candidate.feeMinor < cheapest.feeMinor ? candidate : cheapest;
    }
    // Equal fee: prefer the tighter band, then the lower id, so the choice is stable.
    const candidateSpan = candidate.maxDistanceKm - candidate.minDistanceKm;
    const cheapestSpan = cheapest.maxDistanceKm - cheapest.minDistanceKm;
    if (candidateSpan !== cheapestSpan) {
      return candidateSpan < cheapestSpan ? candidate : cheapest;
    }
    return candidate.id < cheapest.id ? candidate : cheapest;
  });

  return { deliverable: true, distanceKm, zone, feeMinor: zone.feeMinor };
}

/* ------------------------------------------------------------------ */
/* Validation of a restaurant's zone set                               */
/* ------------------------------------------------------------------ */

export const ZoneIssue = {
  INVALID_RANGE: 'INVALID_RANGE',
  NEGATIVE_DISTANCE: 'NEGATIVE_DISTANCE',
  NEGATIVE_FEE: 'NEGATIVE_FEE',
  OVERLAP: 'OVERLAP',
  GAP: 'GAP',
} as const;
export type ZoneIssue = (typeof ZoneIssue)[keyof typeof ZoneIssue];

export interface ZoneValidationIssue {
  readonly issue: ZoneIssue;
  readonly message: string;
  /** Ids of the zones involved; a new, unsaved zone is identified as 0. */
  readonly zoneIds: readonly number[];
  /** Gaps are advisory — a restaurant may legitimately not serve a band. */
  readonly severity: 'error' | 'warning';
}

/**
 * Check a complete proposed set of zones for a restaurant. Callers pass the set
 * as it would be *after* the pending create/update is applied, so a zone being
 * edited never conflicts with its own stored row.
 */
export function validateZoneSet(
  zones: readonly DeliveryZoneRule[],
): ZoneValidationIssue[] {
  const issues: ZoneValidationIssue[] = [];

  for (const zone of zones) {
    if (zone.minDistanceKm < 0 || zone.maxDistanceKm < 0) {
      issues.push({
        issue: ZoneIssue.NEGATIVE_DISTANCE,
        message: 'Distances cannot be negative.',
        zoneIds: [zone.id],
        severity: 'error',
      });
    }
    if (zone.maxDistanceKm <= zone.minDistanceKm) {
      issues.push({
        issue: ZoneIssue.INVALID_RANGE,
        message: `Maximum distance (${zone.maxDistanceKm} km) must be greater than minimum (${zone.minDistanceKm} km).`,
        zoneIds: [zone.id],
        severity: 'error',
      });
    }
    if (zone.feeMinor < 0) {
      issues.push({
        issue: ZoneIssue.NEGATIVE_FEE,
        message: 'Delivery fee cannot be negative.',
        zoneIds: [zone.id],
        severity: 'error',
      });
    }
  }

  // Only active, well-formed zones can meaningfully overlap.
  const sorted = zones
    .filter((z) => z.isActive && z.maxDistanceKm > z.minDistanceKm)
    .slice()
    .sort((a, b) => a.minDistanceKm - b.minDistanceKm || a.maxDistanceKm - b.maxDistanceKm);

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]!;
    const current = sorted[i]!;
    // Half-open intervals touch without overlapping when current.min === previous.max.
    if (current.minDistanceKm < previous.maxDistanceKm) {
      issues.push({
        issue: ZoneIssue.OVERLAP,
        message: `Zone ${describeZone(previous)} overlaps ${describeZone(current)}. Zones must not cover the same distance twice.`,
        zoneIds: [previous.id, current.id],
        severity: 'error',
      });
    } else if (current.minDistanceKm > previous.maxDistanceKm) {
      issues.push({
        issue: ZoneIssue.GAP,
        message: `No delivery between ${previous.maxDistanceKm} km and ${current.minDistanceKm} km. Customers in that band cannot order.`,
        zoneIds: [previous.id, current.id],
        severity: 'warning',
      });
    }
  }

  return issues;
}

export function zoneSetErrors(zones: readonly DeliveryZoneRule[]): ZoneValidationIssue[] {
  return validateZoneSet(zones).filter((i) => i.severity === 'error');
}

/** "0–5 km" — the label the dashboard and customer UI both render. */
export function describeZone(zone: DeliveryZoneRule): string {
  return `${trimKm(zone.minDistanceKm)}–${trimKm(zone.maxDistanceKm)} km`;
}

function trimKm(km: number): string {
  return Number.isInteger(km) ? String(km) : String(km).replace(/0+$/, '').replace(/\.$/, '');
}
