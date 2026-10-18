import { and, asc, desc, eq, exists, isNull, like, or, sql } from 'drizzle-orm';
import {
  RestaurantStatus,
  fromDecimalString,
  haversineKm,
  matchDeliveryZone,
  type DeliveryQuote,
  type DeliveryZoneRule,
  type LatLng,
} from '@nayaro/shared';
import { db } from '../../db/client.js';
import {
  categories,
  deliveryZones,
  foodItems,
  restaurantRankings,
  restaurantSettings,
  restaurants,
} from '../../db/schema/index.js';
import { notFound } from '../../http/errors.js';

/**
 * Read models for the public, unauthenticated customer site.
 *
 * Everything here is filtered to ACTIVE, non-deleted restaurants and available
 * menu items, so an inactive tenant or a hidden dish is invisible to customers
 * regardless of what the caller asks for.
 */

export interface PublicRestaurantSummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  address: string;
  isOpen: boolean;
  acceptsOrders: boolean;
  categories: string[];
  /** Platform relevance score, 0-100. Surfaced so ranking is not a black box. */
  rankScore: number;
  /** True when a Super Admin has pinned this restaurant to a fixed slot. */
  promoted: boolean;
  /**
   * Customers' average rating, 1–5, one decimal. Only the average is public;
   * the written comments are private to the restaurant. Null until reviewed.
   */
  rating: { average: number; count: number } | null;
  /** Present only when the caller supplied coordinates. */
  distanceKm: number | null;
  delivery: DeliveryQuote | null;
  deliveryFrom: { minFeeMinor: number; maxSupportedKm: number } | null;
}

const ratingAvgSql = sql<string | null>`(select round(avg(r.rating), 1) from order_reviews r where r.restaurant_id = ${restaurants.id})`;
const ratingCountSql = sql<number>`(select count(*) from order_reviews r where r.restaurant_id = ${restaurants.id})`;

function toRating(average: string | number | null, count: number | string): { average: number; count: number } | null {
  const total = Number(count ?? 0);
  return total > 0 && average !== null ? { average: Number(average), count: total } : null;
}

const activeRestaurantFilter = and(
  eq(restaurants.status, RestaurantStatus.ACTIVE),
  isNull(restaurants.deletedAt),
);

/** Active zones for one restaurant, in the shape the matching engine expects. */
async function loadZones(restaurantId: number): Promise<DeliveryZoneRule[]> {
  const rows = await db
    .select()
    .from(deliveryZones)
    .where(and(eq(deliveryZones.restaurantId, restaurantId), eq(deliveryZones.isActive, 1)))
    .orderBy(asc(deliveryZones.minDistanceKm));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    minDistanceKm: row.minDistanceKm,
    maxDistanceKm: row.maxDistanceKm,
    feeMinor: fromDecimalString(row.deliveryFee),
    isActive: row.isActive === 1,
  }));
}


/**
 * Escape the LIKE wildcards so a customer searching for "50%" or "a_b" gets a
 * literal match instead of a pattern that scans everything.
 */
function likeTerm(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * "Search food or restaurant" means exactly that: a restaurant matches on its
 * own name or description, on one of its category names, or on any available
 * dish it sells. Searching "momo" finds the kitchen that cooks it, not only the
 * ones with "Momo" in their name.
 */
function buildSearchFilter(search: string) {
  const term = likeTerm(search);
  return or(
    like(restaurants.name, term),
    like(restaurants.description, term),
    exists(
      db
        .select({ hit: sql`1` })
        .from(categories)
        .where(
          and(
            eq(categories.restaurantId, restaurants.id),
            eq(categories.isActive, 1),
            isNull(categories.deletedAt),
            like(categories.name, term),
          ),
        ),
    ),
    exists(
      db
        .select({ hit: sql`1` })
        .from(foodItems)
        .where(
          and(
            eq(foodItems.restaurantId, restaurants.id),
            eq(foodItems.isAvailable, 1),
            isNull(foodItems.deletedAt),
            like(foodItems.name, term),
          ),
        ),
    ),
  );
}

export async function listPublicRestaurants(params: {
  search?: string | undefined;
  origin?: LatLng | undefined;
  page: number;
  perPage: number;
}): Promise<{ items: PublicRestaurantSummary[]; total: number }> {
  const { search, origin, page, perPage } = params;

  const searchFilter = search ? buildSearchFilter(search) : undefined;
  const where = searchFilter ? and(activeRestaurantFilter, searchFilter) : activeRestaurantFilter;

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(restaurants)
    .where(where);

  const rows = await db
    .select({
      id: restaurants.id,
      slug: restaurants.slug,
      name: restaurants.name,
      description: restaurants.description,
      logoUrl: restaurants.logoUrl,
      ratingAvg: ratingAvgSql,
      ratingCount: ratingCountSql,
      coverUrl: restaurants.coverUrl,
      address: restaurants.address,
      latitude: restaurants.latitude,
      longitude: restaurants.longitude,
      isOpen: restaurants.isOpen,
      acceptsOrders: restaurantSettings.acceptsOrders,
      rankScore: restaurantRankings.score,
      pinnedPosition: restaurantRankings.pinnedPosition,
    })
    .from(restaurants)
    .leftJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .leftJoin(restaurantRankings, eq(restaurantRankings.restaurantId, restaurants.id))
    .where(where)
    // Editorially pinned slots first, then the organic score, then name so the
    // order is stable for restaurants that tie.
    .orderBy(
      sql`${restaurantRankings.pinnedPosition} is null`,
      asc(restaurantRankings.pinnedPosition),
      desc(restaurantRankings.score),
      asc(restaurants.name),
    )
    .limit(perPage)
    .offset((page - 1) * perPage);

  const items = await Promise.all(
    rows.map(async (row): Promise<PublicRestaurantSummary> => {
      const [categoryRows, zones] = await Promise.all([
        db
          .select({ name: categories.name })
          .from(categories)
          .where(
            and(
              eq(categories.restaurantId, row.id),
              eq(categories.isActive, 1),
              isNull(categories.deletedAt),
            ),
          )
          .orderBy(asc(categories.sortOrder))
          .limit(6),
        loadZones(row.id),
      ]);

      // Distance is only meaningful once the customer has picked a location.
      let distanceKm: number | null = null;
      let delivery: DeliveryQuote | null = null;
      if (origin && row.latitude !== null && row.longitude !== null) {
        distanceKm = haversineKm(
          { latitude: row.latitude, longitude: row.longitude },
          origin,
        );
        delivery = matchDeliveryZone(distanceKm, zones);
      }

      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        logoUrl: row.logoUrl,
        coverUrl: row.coverUrl,
        address: row.address,
        isOpen: row.isOpen === 1,
        acceptsOrders: (row.acceptsOrders ?? 0) === 1,
        categories: categoryRows.map((c) => c.name),
        rankScore: row.rankScore ?? 0,
        promoted: row.pinnedPosition !== null,
        rating: toRating(row.ratingAvg, row.ratingCount),
        distanceKm,
        delivery,
        deliveryFrom:
          zones.length > 0
            ? {
                minFeeMinor: Math.min(...zones.map((z) => z.feeMinor)),
                maxSupportedKm: Math.max(...zones.map((z) => z.maxDistanceKm)),
              }
            : null,
      };
    }),
  );

  return { items, total: Number(count) };
}

export interface PublicMenuItem {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceMinor: number;
  discountPriceMinor: number | null;
  /** What the customer is actually charged — the discount when one applies. */
  effectivePriceMinor: number;
  prepTimeMinutes: number | null;
}

export interface PublicRestaurantDetail extends PublicRestaurantSummary {
  latitude: number | null;
  longitude: number | null;
  phone: string;
  minOrderMinor: number;
  currency: string;
  zones: DeliveryZoneRule[];
  menu: { id: number; name: string; items: PublicMenuItem[] }[];
}

export async function getPublicRestaurant(
  slug: string,
  origin?: LatLng,
): Promise<PublicRestaurantDetail> {
  const [row] = await db
    .select({
      id: restaurants.id,
      slug: restaurants.slug,
      name: restaurants.name,
      description: restaurants.description,
      logoUrl: restaurants.logoUrl,
      ratingAvg: ratingAvgSql,
      ratingCount: ratingCountSql,
      coverUrl: restaurants.coverUrl,
      address: restaurants.address,
      phone: restaurants.phone,
      latitude: restaurants.latitude,
      longitude: restaurants.longitude,
      isOpen: restaurants.isOpen,
      acceptsOrders: restaurantSettings.acceptsOrders,
      minOrderAmount: restaurantSettings.minOrderAmount,
      currency: restaurantSettings.currency,
    })
    .from(restaurants)
    .leftJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(and(activeRestaurantFilter, eq(restaurants.slug, slug)))
    .limit(1);

  if (!row) throw notFound('That restaurant is not available.', 'RESTAURANT_NOT_FOUND');

  const zones = await loadZones(row.id);

  const menuRows = await db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      categorySort: categories.sortOrder,
      itemId: foodItems.id,
      itemName: foodItems.name,
      itemDescription: foodItems.description,
      itemImage: foodItems.imageUrl,
      price: foodItems.price,
      discountPrice: foodItems.discountPrice,
      prepTimeMinutes: foodItems.prepTimeMinutes,
      itemSort: foodItems.sortOrder,
    })
    .from(categories)
    .innerJoin(
      foodItems,
      and(
        eq(foodItems.categoryId, categories.id),
        // Customers only ever see available, non-deleted items.
        eq(foodItems.isAvailable, 1),
        isNull(foodItems.deletedAt),
      ),
    )
    .where(
      and(
        eq(categories.restaurantId, row.id),
        eq(categories.isActive, 1),
        isNull(categories.deletedAt),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(foodItems.sortOrder), asc(foodItems.name));

  const menuByCategory = new Map<number, { id: number; name: string; items: PublicMenuItem[] }>();
  for (const item of menuRows) {
    let group = menuByCategory.get(item.categoryId);
    if (!group) {
      group = { id: item.categoryId, name: item.categoryName, items: [] };
      menuByCategory.set(item.categoryId, group);
    }
    const priceMinor = fromDecimalString(item.price);
    const discountPriceMinor = item.discountPrice ? fromDecimalString(item.discountPrice) : null;
    group.items.push({
      id: item.itemId,
      name: item.itemName,
      description: item.itemDescription,
      imageUrl: item.itemImage,
      priceMinor,
      discountPriceMinor,
      effectivePriceMinor:
        discountPriceMinor !== null && discountPriceMinor < priceMinor ? discountPriceMinor : priceMinor,
      prepTimeMinutes: item.prepTimeMinutes,
    });
  }

  let distanceKm: number | null = null;
  let delivery: DeliveryQuote | null = null;
  if (origin && row.latitude !== null && row.longitude !== null) {
    distanceKm = haversineKm({ latitude: row.latitude, longitude: row.longitude }, origin);
    delivery = matchDeliveryZone(distanceKm, zones);
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    address: row.address,
    phone: row.phone,
    latitude: row.latitude,
    longitude: row.longitude,
    isOpen: row.isOpen === 1,
    acceptsOrders: (row.acceptsOrders ?? 0) === 1,
    minOrderMinor: fromDecimalString(row.minOrderAmount),
    currency: row.currency ?? 'NPR',
    categories: [...menuByCategory.values()].map((c) => c.name),
    rankScore: 0,
    promoted: false,
    rating: toRating(row.ratingAvg, row.ratingCount),
    distanceKm,
    delivery,
    deliveryFrom:
      zones.length > 0
        ? {
            minFeeMinor: Math.min(...zones.map((z) => z.feeMinor)),
            maxSupportedKm: Math.max(...zones.map((z) => z.maxDistanceKm)),
          }
        : null,
    zones,
    menu: [...menuByCategory.values()],
  };
}

/**
 * Advisory delivery quote for the cart screen.
 *
 * The distance is computed here from the restaurant's stored coordinates and
 * the customer's pin — never from a number the client supplied. Checkout runs
 * this same calculation again inside the order transaction, so a tampered
 * quote buys an attacker nothing.
 */
export async function quoteDelivery(
  restaurantId: number,
  destination: LatLng,
): Promise<DeliveryQuote> {
  const [row] = await db
    .select({ latitude: restaurants.latitude, longitude: restaurants.longitude })
    .from(restaurants)
    .where(and(activeRestaurantFilter, eq(restaurants.id, restaurantId)))
    .limit(1);

  if (!row) throw notFound('That restaurant is not available.', 'RESTAURANT_NOT_FOUND');
  if (row.latitude === null || row.longitude === null) {
    throw notFound('This restaurant has not set its location yet.', 'RESTAURANT_LOCATION_MISSING');
  }

  const zones = await loadZones(restaurantId);
  const distanceKm = haversineKm({ latitude: row.latitude, longitude: row.longitude }, destination);
  return matchDeliveryZone(distanceKm, zones);
}
