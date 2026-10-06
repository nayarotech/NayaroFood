import { index, int, mysqlTable, timestamp } from 'drizzle-orm/mysql-core';
import { decimal } from 'drizzle-orm/mysql-core';
import { fk, timestamps } from './_shared.js';
import { restaurants } from './restaurants.js';

/**
 * Search ranking for the public restaurant listing — the platform's own
 * relevance model.
 *
 * Every component is stored, not just the final number, so a restaurant owner
 * can be told exactly why they rank where they do, and a Super Admin can see
 * whether a score is driven by real demand or by an editorial override.
 */
export const restaurantRankings = mysqlTable(
  'restaurant_rankings',
  {
    restaurantId: fk('restaurant_id')
      .primaryKey()
      .references(() => restaurants.id, { onDelete: 'cascade' }),

    /** Final 0–100 score, after weighting and the manual adjustment. */
    score: decimal('score', { precision: 6, scale: 2, mode: 'number' }).notNull().default(0),

    /* Components, each 0–100, kept for explainability. */
    popularityScore: decimal('popularity_score', { precision: 6, scale: 2, mode: 'number' }).notNull().default(0),
    loyaltyScore: decimal('loyalty_score', { precision: 6, scale: 2, mode: 'number' }).notNull().default(0),
    reliabilityScore: decimal('reliability_score', { precision: 6, scale: 2, mode: 'number' }).notNull().default(0),
    completenessScore: decimal('completeness_score', { precision: 6, scale: 2, mode: 'number' }).notNull().default(0),
    freshnessScore: decimal('freshness_score', { precision: 6, scale: 2, mode: 'number' }).notNull().default(0),

    /* Raw signals the components were derived from. */
    orders30d: int('orders_30d').notNull().default(0),
    orders7d: int('orders_7d').notNull().default(0),
    repeatCustomers: int('repeat_customers').notNull().default(0),
    totalCustomers: int('total_customers').notNull().default(0),
    acceptanceRate: decimal('acceptance_rate', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    cancellationRate: decimal('cancellation_rate', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),

    /**
     * Editorial adjustment in score points, -50 to +50, applied after
     * weighting. Lets the platform promote or demote without faking metrics.
     */
    manualBoost: int('manual_boost').notNull().default(0),

    /**
     * Hard override. When set, the restaurant occupies exactly this slot at the
     * top of the listing regardless of score — for launch partners or
     * promotions. Null means "rank organically".
     */
    pinnedPosition: int('pinned_position'),

    computedAt: timestamp('computed_at'),
    ...timestamps(),
  },
  (t) => [
    // The listing's ORDER BY: pinned slots first, then score.
    index('idx_rankings_order').on(t.pinnedPosition, t.score),
    index('idx_rankings_score').on(t.score),
  ],
);

export type RestaurantRankingRow = typeof restaurantRankings.$inferSelect;
