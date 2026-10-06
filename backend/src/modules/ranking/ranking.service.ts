import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { OrderStatus, RestaurantStatus, WhatsAppStatus } from '@nayaro/shared';
import { env } from '../../config/env.js';
import { db, type Executor } from '../../db/client.js';
import {
  categories,
  deliveryZones,
  foodItems,
  orders,
  restaurantCustomers,
  restaurantRankings,
  restaurantSettings,
  restaurants,
} from '../../db/schema/index.js';

/**
 * The platform's relevance model — how "favourable and known" a restaurant is.
 *
 * Five components, each normalised to 0–100 and then weighted. Storing the
 * components rather than only the total is deliberate: a restaurant can be told
 * precisely which signal is holding it back, and the Super Admin can see
 * whether a high position was earned or granted.
 *
 * Weights are declared here and nowhere else, so the model is auditable.
 */
export const RANKING_WEIGHTS = {
  /** Recent demand. The strongest signal that customers actually want this food. */
  popularity: 0.35,
  /** Customers who came back — quality that survives the first order. */
  loyalty: 0.2,
  /** Accepts orders and does not cancel them. Protects customers from no-shows. */
  reliability: 0.2,
  /** A finished, orderable storefront: location, menu, photos, verified WhatsApp. */
  completeness: 0.15,
  /** Still trading. Stops a dormant former favourite outranking a live kitchen. */
  freshness: 0.1,
} as const;

/** Order volume at which popularity saturates, so one giant cannot own page one. */
const POPULARITY_SATURATION = 200;
const MANUAL_BOOST_LIMIT = 50;

export interface RankingSignals {
  orders30d: number;
  orders7d: number;
  repeatCustomers: number;
  totalCustomers: number;
  acceptedOrders: number;
  rejectedOrders: number;
  cancelledOrders: number;
  daysSinceLastOrder: number | null;
  hasLocation: boolean;
  hasLogo: boolean;
  hasDescription: boolean;
  whatsappVerified: boolean;
  zoneCount: number;
  categoryCount: number;
  itemCount: number;
  itemsWithImages: number;
  isActive: boolean;
}

export interface RankingBreakdown {
  score: number;
  popularityScore: number;
  loyaltyScore: number;
  reliabilityScore: number;
  completenessScore: number;
  freshnessScore: number;
  acceptanceRate: number;
  cancellationRate: number;
  signals: RankingSignals;
}

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value));

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Pure scoring. No database access, so the model can be unit-tested against
 * hand-written signal sets rather than fixtures.
 */
export function scoreRestaurant(signals: RankingSignals, manualBoost = 0): RankingBreakdown {
  /* Popularity — log-scaled. Going from 0 to 10 orders should matter far more
     than going from 150 to 160, otherwise the leaderboard ossifies. */
  const weightedVolume = signals.orders30d + signals.orders7d * 2;
  const popularityScore = clamp(
    (Math.log1p(weightedVolume) / Math.log1p(POPULARITY_SATURATION)) * 100,
  );

  /* Loyalty — share of customers who ordered more than once. Needs a minimum
     sample, or one repeat customer out of one would score a perfect 100. */
  const loyaltyScore =
    signals.totalCustomers >= 5
      ? clamp((signals.repeatCustomers / signals.totalCustomers) * 100)
      : signals.totalCustomers > 0
        ? clamp((signals.repeatCustomers / signals.totalCustomers) * 50)
        : 0;

  /* Reliability — accepted vs refused. A restaurant with no history is given a
     neutral 70 rather than 0, so new kitchens are not buried before they start. */
  const decided = signals.acceptedOrders + signals.rejectedOrders;
  const acceptanceRate = decided > 0 ? (signals.acceptedOrders / decided) * 100 : 0;
  const totalHandled = decided + signals.cancelledOrders;
  const cancellationRate = totalHandled > 0 ? (signals.cancelledOrders / totalHandled) * 100 : 0;
  const reliabilityScore =
    totalHandled === 0 ? 70 : clamp(acceptanceRate - cancellationRate * 1.5);

  /* Completeness — the one component a brand-new restaurant fully controls.
     It is what lets a good storefront rank before it has any orders. */
  const completenessChecks: [boolean, number][] = [
    [signals.hasLocation, 22],
    [signals.whatsappVerified, 20],
    [signals.zoneCount > 0, 18],
    [signals.itemCount >= 5, 14],
    [signals.categoryCount >= 2, 8],
    [signals.hasLogo, 6],
    [signals.hasDescription, 4],
    [signals.itemCount > 0 && signals.itemsWithImages / signals.itemCount >= 0.5, 8],
  ];
  const completenessScore = clamp(
    completenessChecks.reduce((total, [met, points]) => total + (met ? points : 0), 0),
  );

  /* Freshness — decays over roughly two months of silence. A restaurant with no
     orders yet is neutral, not penalised; it has not gone quiet, it is new. */
  const freshnessScore =
    signals.daysSinceLastOrder === null
      ? 50
      : clamp(100 - (signals.daysSinceLastOrder / 60) * 100);

  const weighted =
    popularityScore * RANKING_WEIGHTS.popularity +
    loyaltyScore * RANKING_WEIGHTS.loyalty +
    reliabilityScore * RANKING_WEIGHTS.reliability +
    completenessScore * RANKING_WEIGHTS.completeness +
    freshnessScore * RANKING_WEIGHTS.freshness;

  const boost = clamp(manualBoost, -MANUAL_BOOST_LIMIT, MANUAL_BOOST_LIMIT);

  // A suspended or pending restaurant is not publicly listed at all, but zeroing
  // the score keeps it out of any ordering that forgets to filter.
  const score = signals.isActive ? clamp(weighted + boost) : 0;

  return {
    score: round2(score),
    popularityScore: round2(popularityScore),
    loyaltyScore: round2(loyaltyScore),
    reliabilityScore: round2(reliabilityScore),
    completenessScore: round2(completenessScore),
    freshnessScore: round2(freshnessScore),
    acceptanceRate: round2(acceptanceRate),
    cancellationRate: round2(cancellationRate),
    signals,
  };
}

/** Create the ranking row that every restaurant must have. Idempotent. */
export async function ensureRankingRow(executor: Executor, restaurantId: number): Promise<void> {
  await executor
    .insert(restaurantRankings)
    .values({ restaurantId })
    .onDuplicateKeyUpdate({ set: { restaurantId } });
}

const countOf = (rows: { count: number }[]): number => Number(rows[0]?.count ?? 0);

/** Gather every signal for one restaurant straight from the operational tables. */
export async function collectSignals(restaurantId: number): Promise<RankingSignals | null> {
  const [restaurant] = await db
    .select({
      id: restaurants.id,
      status: restaurants.status,
      latitude: restaurants.latitude,
      logoUrl: restaurants.logoUrl,
      description: restaurants.description,
      whatsappStatus: restaurantSettings.whatsappStatus,
    })
    .from(restaurants)
    .leftJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(and(eq(restaurants.id, restaurantId), isNull(restaurants.deletedAt)))
    .limit(1);

  if (!restaurant) return null;

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const tenant = eq(orders.restaurantId, restaurantId);

  const [
    orders30,
    orders7,
    accepted,
    rejected,
    cancelled,
    lastOrder,
    customerTotals,
    zones,
    cats,
    items,
    withImages,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(orders).where(and(tenant, gte(orders.placedAt, since30))),
    db.select({ count: sql<number>`count(*)` }).from(orders).where(and(tenant, gte(orders.placedAt, since7))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(tenant, sql`${orders.status} <> ${OrderStatus.PENDING} AND ${orders.status} <> ${OrderStatus.REJECTED}`)),
    db.select({ count: sql<number>`count(*)` }).from(orders).where(and(tenant, eq(orders.status, OrderStatus.REJECTED))),
    db.select({ count: sql<number>`count(*)` }).from(orders).where(and(tenant, eq(orders.status, OrderStatus.CANCELLED))),
    db
      .select({ placedAt: orders.placedAt })
      .from(orders)
      .where(tenant)
      .orderBy(sql`${orders.placedAt} desc`)
      .limit(1),
    db
      .select({
        total: sql<number>`count(*)`,
        repeat: sql<number>`sum(case when ${restaurantCustomers.orderCount} > 1 then 1 else 0 end)`,
      })
      .from(restaurantCustomers)
      .where(eq(restaurantCustomers.restaurantId, restaurantId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(deliveryZones)
      .where(and(eq(deliveryZones.restaurantId, restaurantId), eq(deliveryZones.isActive, 1))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(categories)
      .where(and(eq(categories.restaurantId, restaurantId), eq(categories.isActive, 1), isNull(categories.deletedAt))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(foodItems)
      .where(and(eq(foodItems.restaurantId, restaurantId), eq(foodItems.isAvailable, 1), isNull(foodItems.deletedAt))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(foodItems)
      .where(
        and(
          eq(foodItems.restaurantId, restaurantId),
          isNull(foodItems.deletedAt),
          sql`${foodItems.imageUrl} is not null and ${foodItems.imageUrl} <> ''`,
        ),
      ),
  ]);

  const lastPlacedAt = lastOrder[0]?.placedAt ?? null;

  return {
    orders30d: countOf(orders30),
    orders7d: countOf(orders7),
    repeatCustomers: Number(customerTotals[0]?.repeat ?? 0),
    totalCustomers: Number(customerTotals[0]?.total ?? 0),
    acceptedOrders: countOf(accepted),
    rejectedOrders: countOf(rejected),
    cancelledOrders: countOf(cancelled),
    daysSinceLastOrder: lastPlacedAt
      ? Math.floor((Date.now() - lastPlacedAt.getTime()) / (24 * 60 * 60 * 1000))
      : null,
    hasLocation: restaurant.latitude !== null,
    hasLogo: Boolean(restaurant.logoUrl),
    hasDescription: Boolean(restaurant.description && restaurant.description.length > 20),
    // While WhatsApp is switched off nobody can verify, so nobody is penalised.
    whatsappVerified: !env.WHATSAPP_ENABLED || restaurant.whatsappStatus === WhatsAppStatus.VERIFIED,
    zoneCount: countOf(zones),
    categoryCount: countOf(cats),
    itemCount: countOf(items),
    itemsWithImages: countOf(withImages),
    isActive: restaurant.status === RestaurantStatus.ACTIVE,
  };
}

/** Recompute and persist one restaurant's ranking. Returns the breakdown. */
export async function recomputeRanking(restaurantId: number): Promise<RankingBreakdown | null> {
  const signals = await collectSignals(restaurantId);
  if (!signals) return null;

  await ensureRankingRow(db, restaurantId);

  const [existing] = await db
    .select({ manualBoost: restaurantRankings.manualBoost })
    .from(restaurantRankings)
    .where(eq(restaurantRankings.restaurantId, restaurantId))
    .limit(1);

  const breakdown = scoreRestaurant(signals, existing?.manualBoost ?? 0);

  await db
    .update(restaurantRankings)
    .set({
      score: breakdown.score,
      popularityScore: breakdown.popularityScore,
      loyaltyScore: breakdown.loyaltyScore,
      reliabilityScore: breakdown.reliabilityScore,
      completenessScore: breakdown.completenessScore,
      freshnessScore: breakdown.freshnessScore,
      acceptanceRate: breakdown.acceptanceRate,
      cancellationRate: breakdown.cancellationRate,
      orders30d: signals.orders30d,
      orders7d: signals.orders7d,
      repeatCustomers: signals.repeatCustomers,
      totalCustomers: signals.totalCustomers,
      computedAt: new Date(),
    })
    .where(eq(restaurantRankings.restaurantId, restaurantId));

  return breakdown;
}

/** Recompute every restaurant. Intended for a scheduled job. */
export async function recomputeAllRankings(): Promise<{ updated: number }> {
  const rows = await db
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(isNull(restaurants.deletedAt));

  let updated = 0;
  for (const row of rows) {
    if (await recomputeRanking(row.id)) updated += 1;
  }
  return { updated };
}
