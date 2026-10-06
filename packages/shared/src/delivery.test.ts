import { describe, expect, it } from 'vitest';
import {
  UndeliverableReason,
  ZoneIssue,
  matchDeliveryZone,
  validateZoneSet,
  zoneSetErrors,
  type DeliveryZoneRule,
} from './delivery.js';

/**
 * The zone set used across the brief:
 *   0-5 km   free
 *   5-10 km  Rs. 10
 *   10-20 km Rs. 50
 */
const zone = (
  id: number,
  min: number,
  max: number,
  feeMinor: number,
  isActive = true,
): DeliveryZoneRule => ({ id, name: null, minDistanceKm: min, maxDistanceKm: max, feeMinor, isActive });

const STANDARD: DeliveryZoneRule[] = [
  zone(1, 0, 5, 0),
  zone(2, 5, 10, 1_000),
  zone(3, 10, 20, 5_000),
];

describe('matchDeliveryZone', () => {
  it('delivers free inside the first zone', () => {
    const quote = matchDeliveryZone(3.2, STANDARD);
    expect(quote.deliverable).toBe(true);
    if (!quote.deliverable) return;
    expect(quote.feeMinor).toBe(0);
    expect(quote.zone.id).toBe(1);
  });

  it('charges the matching fee inside a paid zone — the 7.4 km case from the brief', () => {
    const quote = matchDeliveryZone(7.4, STANDARD);
    expect(quote.deliverable).toBe(true);
    if (!quote.deliverable) return;
    expect(quote.feeMinor).toBe(1_000);
    expect(quote.zone.id).toBe(2);
    expect(quote.distanceKm).toBe(7.4);
  });

  it('charges the third band at 17 km', () => {
    const quote = matchDeliveryZone(17, STANDARD);
    expect(quote.deliverable).toBe(true);
    if (!quote.deliverable) return;
    expect(quote.feeMinor).toBe(5_000);
  });

  it('refuses delivery beyond every zone — the 25 km case from the brief', () => {
    const quote = matchDeliveryZone(25, STANDARD);
    expect(quote.deliverable).toBe(false);
    if (quote.deliverable) return;
    expect(quote.reason).toBe(UndeliverableReason.OUTSIDE_ALL_ZONES);
    expect(quote.maxSupportedKm).toBe(20);
  });

  describe('boundaries are half-open: [min, max)', () => {
    it('assigns an exact boundary distance to the OUTER zone', () => {
      // 5.00 km belongs to 5-10, not to 0-5.
      const quote = matchDeliveryZone(5, STANDARD);
      expect(quote.deliverable).toBe(true);
      if (!quote.deliverable) return;
      expect(quote.zone.id).toBe(2);
      expect(quote.feeMinor).toBe(1_000);
    });

    it('keeps the value just below a boundary in the inner zone', () => {
      const quote = matchDeliveryZone(4.99, STANDARD);
      expect(quote.deliverable).toBe(true);
      if (!quote.deliverable) return;
      expect(quote.zone.id).toBe(1);
    });

    it('treats zero distance as inside the first zone', () => {
      const quote = matchDeliveryZone(0, STANDARD);
      expect(quote.deliverable).toBe(true);
      if (!quote.deliverable) return;
      expect(quote.zone.id).toBe(1);
    });

    it('refuses the outermost max exactly, because max is exclusive', () => {
      const quote = matchDeliveryZone(20, STANDARD);
      expect(quote.deliverable).toBe(false);
    });

    it('accepts the last deliverable value below the outer max', () => {
      const quote = matchDeliveryZone(19.99, STANDARD);
      expect(quote.deliverable).toBe(true);
    });
  });

  it('ignores inactive zones entirely', () => {
    const zones = [zone(1, 0, 5, 0), zone(2, 5, 10, 1_000, false)];
    const quote = matchDeliveryZone(7, zones);
    expect(quote.deliverable).toBe(false);
    if (quote.deliverable) return;
    expect(quote.maxSupportedKm).toBe(5);
  });

  it('reports NO_ZONES_CONFIGURED when a restaurant has not set up delivery', () => {
    const quote = matchDeliveryZone(2, []);
    expect(quote.deliverable).toBe(false);
    if (quote.deliverable) return;
    expect(quote.reason).toBe(UndeliverableReason.NO_ZONES_CONFIGURED);
  });

  it('refuses a gap between two configured zones', () => {
    const zones = [zone(1, 0, 5, 0), zone(2, 10, 20, 5_000)];
    expect(matchDeliveryZone(7, zones).deliverable).toBe(false);
  });

  describe('overlapping zones', () => {
    it('picks the cheapest fee when bands overlap', () => {
      const zones = [zone(1, 0, 10, 5_000), zone(2, 5, 15, 1_000)];
      const quote = matchDeliveryZone(7, zones);
      expect(quote.deliverable).toBe(true);
      if (!quote.deliverable) return;
      expect(quote.feeMinor).toBe(1_000);
      expect(quote.zone.id).toBe(2);
    });

    it('is deterministic regardless of the order zones arrive in', () => {
      const zones = [zone(1, 0, 10, 5_000), zone(2, 5, 15, 1_000)];
      const a = matchDeliveryZone(7, zones);
      const b = matchDeliveryZone(7, [...zones].reverse());
      expect(a.deliverable && a.zone.id).toBe(b.deliverable && b.zone.id);
    });

    it('breaks an equal-fee tie by the narrower band', () => {
      const zones = [zone(1, 0, 20, 1_000), zone(2, 5, 10, 1_000)];
      const quote = matchDeliveryZone(7, zones);
      expect(quote.deliverable && quote.zone.id).toBe(2);
    });
  });

  it('rounds the distance before matching, so 4.999 km stays in the inner zone', () => {
    const quote = matchDeliveryZone(4.999, STANDARD);
    // 4.999 rounds to 5.00, which is the outer zone by the half-open rule.
    expect(quote.deliverable && quote.zone.id).toBe(2);
    expect(quote.distanceKm).toBe(5);
  });
});

describe('validateZoneSet', () => {
  it('accepts a contiguous, non-overlapping set', () => {
    expect(zoneSetErrors(STANDARD)).toEqual([]);
  });

  it('flags overlapping bands as an error', () => {
    const issues = validateZoneSet([zone(1, 0, 10, 0), zone(2, 5, 15, 1_000)]);
    const overlap = issues.find((i) => i.issue === ZoneIssue.OVERLAP);
    expect(overlap).toBeDefined();
    expect(overlap?.severity).toBe('error');
    expect(overlap?.zoneIds).toEqual([1, 2]);
  });

  it('does not treat touching bands as overlapping', () => {
    const issues = validateZoneSet([zone(1, 0, 5, 0), zone(2, 5, 10, 1_000)]);
    expect(issues).toEqual([]);
  });

  it('warns but does not block on a gap', () => {
    const issues = validateZoneSet([zone(1, 0, 5, 0), zone(2, 10, 20, 5_000)]);
    expect(issues.map((i) => i.issue)).toContain(ZoneIssue.GAP);
    expect(zoneSetErrors([zone(1, 0, 5, 0), zone(2, 10, 20, 5_000)])).toEqual([]);
  });

  it('rejects a band whose max is not greater than its min', () => {
    expect(zoneSetErrors([zone(1, 5, 5, 0)]).map((i) => i.issue)).toContain(
      ZoneIssue.INVALID_RANGE,
    );
    expect(zoneSetErrors([zone(1, 10, 5, 0)]).map((i) => i.issue)).toContain(
      ZoneIssue.INVALID_RANGE,
    );
  });

  it('rejects negative distances and fees', () => {
    expect(zoneSetErrors([zone(1, -1, 5, 0)]).map((i) => i.issue)).toContain(
      ZoneIssue.NEGATIVE_DISTANCE,
    );
    expect(zoneSetErrors([zone(1, 0, 5, -100)]).map((i) => i.issue)).toContain(
      ZoneIssue.NEGATIVE_FEE,
    );
  });

  it('ignores overlap between an active and an inactive zone', () => {
    expect(zoneSetErrors([zone(1, 0, 10, 0), zone(2, 5, 15, 1_000, false)])).toEqual([]);
  });
});
