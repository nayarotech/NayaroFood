import { describe, expect, it } from 'vitest';
import { RANKING_WEIGHTS, scoreRestaurant, type RankingSignals } from './ranking.service.js';

/** A complete, active, but brand-new restaurant: no orders yet. */
const baseline: RankingSignals = {
  orders30d: 0,
  orders7d: 0,
  repeatCustomers: 0,
  totalCustomers: 0,
  acceptedOrders: 0,
  rejectedOrders: 0,
  cancelledOrders: 0,
  daysSinceLastOrder: null,
  hasLocation: true,
  hasLogo: true,
  hasDescription: true,
  whatsappVerified: true,
  zoneCount: 3,
  categoryCount: 3,
  itemCount: 12,
  itemsWithImages: 12,
  isActive: true,
};

const signals = (overrides: Partial<RankingSignals>): RankingSignals => ({
  ...baseline,
  ...overrides,
});

describe('ranking weights', () => {
  it('sum to exactly 1, so the score stays on a 0-100 scale', () => {
    const total = Object.values(RANKING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('scoreRestaurant', () => {
  it('keeps every score within 0-100', () => {
    const cases = [
      signals({}),
      signals({ orders30d: 5000, orders7d: 5000 }),
      signals({ rejectedOrders: 1000, cancelledOrders: 1000 }),
      signals({ daysSinceLastOrder: 3650 }),
    ];
    for (const input of cases) {
      const result = scoreRestaurant(input);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it('zeroes the score for a restaurant that is not active', () => {
    expect(scoreRestaurant(signals({ isActive: false })).score).toBe(0);
    expect(scoreRestaurant(signals({ isActive: false, orders30d: 500 })).score).toBe(0);
  });

  describe('popularity', () => {
    it('ranks a busy kitchen above a quiet one', () => {
      const busy = scoreRestaurant(signals({ orders30d: 120, orders7d: 40 }));
      const quiet = scoreRestaurant(signals({ orders30d: 2 }));
      expect(busy.score).toBeGreaterThan(quiet.score);
    });

    it('weights recent orders more heavily than older ones', () => {
      const recent = scoreRestaurant(signals({ orders30d: 20, orders7d: 20 }));
      const stale = scoreRestaurant(signals({ orders30d: 20, orders7d: 0 }));
      expect(recent.popularityScore).toBeGreaterThan(stale.popularityScore);
    });

    it('saturates, so one giant cannot permanently own the top slot', () => {
      const big = scoreRestaurant(signals({ orders30d: 200 })).popularityScore;
      const huge = scoreRestaurant(signals({ orders30d: 2000 })).popularityScore;
      // Ten times the volume must not be ten times the score.
      expect(huge - big).toBeLessThan(25);
    });
  });

  describe('loyalty', () => {
    it('rewards repeat customers', () => {
      const loyal = scoreRestaurant(signals({ totalCustomers: 20, repeatCustomers: 15 }));
      const churning = scoreRestaurant(signals({ totalCustomers: 20, repeatCustomers: 1 }));
      expect(loyal.loyaltyScore).toBeGreaterThan(churning.loyaltyScore);
    });

    it('discounts a perfect ratio drawn from too small a sample', () => {
      const tiny = scoreRestaurant(signals({ totalCustomers: 1, repeatCustomers: 1 }));
      const real = scoreRestaurant(signals({ totalCustomers: 20, repeatCustomers: 20 }));
      expect(tiny.loyaltyScore).toBeLessThan(real.loyaltyScore);
    });
  });

  describe('reliability', () => {
    it('gives a new restaurant a neutral score rather than zero', () => {
      // Otherwise a kitchen could never escape the bottom of its first page.
      expect(scoreRestaurant(signals({})).reliabilityScore).toBe(70);
    });

    it('punishes rejecting orders', () => {
      const good = scoreRestaurant(signals({ acceptedOrders: 95, rejectedOrders: 5 }));
      const bad = scoreRestaurant(signals({ acceptedOrders: 50, rejectedOrders: 50 }));
      expect(good.reliabilityScore).toBeGreaterThan(bad.reliabilityScore);
    });

    it('punishes cancellations harder than rejections', () => {
      const rejects = scoreRestaurant(signals({ acceptedOrders: 90, rejectedOrders: 10 }));
      const cancels = scoreRestaurant(signals({ acceptedOrders: 90, cancelledOrders: 10 }));
      expect(cancels.reliabilityScore).toBeLessThan(rejects.reliabilityScore);
    });
  });

  describe('completeness', () => {
    it('lets a finished storefront outrank an unfinished one with equal orders', () => {
      const finished = scoreRestaurant(signals({}));
      const unfinished = scoreRestaurant(
        signals({ whatsappVerified: false, zoneCount: 0, itemCount: 1, itemsWithImages: 0 }),
      );
      expect(finished.score).toBeGreaterThan(unfinished.score);
    });

    it('treats an unverified WhatsApp number as a real deduction', () => {
      const verified = scoreRestaurant(signals({}));
      const unverified = scoreRestaurant(signals({ whatsappVerified: false }));
      expect(verified.completenessScore - unverified.completenessScore).toBe(20);
    });

    it('requires delivery zones — without them a customer cannot order at all', () => {
      const withZones = scoreRestaurant(signals({}));
      const without = scoreRestaurant(signals({ zoneCount: 0 }));
      expect(withZones.completenessScore).toBeGreaterThan(without.completenessScore);
    });
  });

  describe('freshness', () => {
    it('does not penalise a restaurant that has never had an order', () => {
      expect(scoreRestaurant(signals({ daysSinceLastOrder: null })).freshnessScore).toBe(50);
    });

    it('decays a dormant restaurant below an active one', () => {
      const active = scoreRestaurant(signals({ daysSinceLastOrder: 1 }));
      const dormant = scoreRestaurant(signals({ daysSinceLastOrder: 45 }));
      expect(dormant.freshnessScore).toBeLessThan(active.freshnessScore);
    });

    it('floors at zero rather than going negative after long silence', () => {
      expect(scoreRestaurant(signals({ daysSinceLastOrder: 400 })).freshnessScore).toBe(0);
    });
  });

  describe('manual boost', () => {
    it('raises and lowers the final score', () => {
      const plain = scoreRestaurant(signals({})).score;
      expect(scoreRestaurant(signals({}), 20).score).toBeGreaterThan(plain);
      expect(scoreRestaurant(signals({}), -20).score).toBeLessThan(plain);
    });

    it('is clamped, so it can never single-handedly decide the ranking', () => {
      const absurd = scoreRestaurant(signals({}), 10_000);
      const allowed = scoreRestaurant(signals({}), 50);
      expect(absurd.score).toBe(allowed.score);
    });

    it('does not resurrect an inactive restaurant', () => {
      expect(scoreRestaurant(signals({ isActive: false }), 50).score).toBe(0);
    });
  });

  it('reports components that add up to the weighted total', () => {
    const result = scoreRestaurant(signals({ orders30d: 30, totalCustomers: 10, repeatCustomers: 4 }));
    const recomputed =
      result.popularityScore * RANKING_WEIGHTS.popularity +
      result.loyaltyScore * RANKING_WEIGHTS.loyalty +
      result.reliabilityScore * RANKING_WEIGHTS.reliability +
      result.completenessScore * RANKING_WEIGHTS.completeness +
      result.freshnessScore * RANKING_WEIGHTS.freshness;
    expect(result.score).toBeCloseTo(recomputed, 1);
  });
});
