import { menuItemLabel } from '@nayaro/shared';
import { OFFSET_MINUTES, platformDate, platformDayStart } from '../../lib/platform-day.js';
import { Router } from 'express';
import { and, asc, desc, eq, gte, inArray, isNull, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  Actor,
  OrderStatus,
  RestaurantStatus,
  adminUpdateRestaurantStatusSchema,
  enumValues,
  fromDecimalString,
  idSchema,
  normaliseTrackingCode,
  paginationSchema,
  searchSchema,
  updateOrderStatusSchema,
  UserStatus,
  adminCustomerListSchema,
  setCustomerBlockSchema,
  type SetCustomerBlockInput,
  type AdminUpdateRestaurantStatusInput,
  type UpdateOrderStatusInput,
} from '@nayaro/shared';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import {
  auditLogs,
  categories,
  customerRemarks,
  customers,
  deliveryZones,
  foodItems,
  notificationLogs,
  orderItems,
  orderReviews,
  orderStatusHistory,
  orders,
  restaurantRankings,
  restaurantSettings,
  restaurantUsers,
  restaurants,
  users,
} from '../../db/schema/index.js';
import { requireAuth, requireSuperAdmin, authOf } from '../../http/middleware/auth.js';
import {
  asyncHandler,
  validateBody,
  validateParams,
  validateQuery,
  validatedParams,
  validatedQuery,
} from '../../http/middleware/validate.js';
import { badRequest, conflict, notFound } from '../../http/errors.js';
import { ok, paginated } from '../../http/respond.js';
import { collectSignals, recomputeAllRankings, recomputeRanking } from '../ranking/ranking.service.js';
import { emitRealtime, subscribePlatform } from '../realtime/events.js';
import { updateOrderStatus } from '../orders/orders.service.js';
import { adminSiteRouter } from '../site/site.routes.js';
import { revokeAllSessions } from '../auth/auth.service.js';
import { alias } from 'drizzle-orm/mysql-core';

/**
 * Platform administration. Mounted behind requireSuperAdmin, deliberately
 * separate from the tenant surface so no restaurant-admin route can ever reach
 * these handlers by accident.
 *
 * This is the one surface that reads across tenants, so every handler here is
 * read-mostly, and every write is audited.
 */
export const adminRouter: Router = Router();

adminRouter.use(requireAuth, requireSuperAdmin);

/** Site content: homepage, footer, pages, contact inbox. */
adminRouter.use('/site', adminSiteRouter);

async function writeAudit(params: {
  actorUserId: number;
  action: string;
  restaurantId: number | null;
  entityType?: string;
  entityId?: string | number | null;
  metadata?: unknown;
  ip: string | undefined;
}): Promise<void> {
  const entityType = params.entityType ?? 'restaurant';
  const entityId =
    params.entityId !== undefined
      ? params.entityId
      : entityType === 'restaurant'
        ? params.restaurantId
        : null;
  await db.insert(auditLogs).values({
    actorUserId: params.actorUserId,
    restaurantId: params.restaurantId,
    action: params.action,
    entityType,
    entityId: entityId === null ? null : String(entityId),
    metadata: params.metadata ?? null,
    ipAddress: params.ip?.slice(0, 45) ?? null,
  });
}

/** Escape LIKE wildcards so a search for "50%" means the literal text. */
const likeTerm = (value: string): string => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const toInt = (value: unknown): number => Number(value ?? 0);
const toMinor = (value: unknown): number => fromDecimalString(String(value ?? '0'));
/** Raw aggregate timestamps arrive as "YYYY-MM-DD HH:MM:SS" in UTC. */
const toIso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(`${String(value).replace(' ', 'T')}Z`).toISOString();
};

/* ------------------------------------------------------------------ */
/* Platform days                                                       */
/* ------------------------------------------------------------------ */


const localDay = (column: SQL | typeof orders.placedAt) =>
  sql<string>`date_format(convert_tz(${column}, '+00:00', ${env.PLATFORM_UTC_OFFSET}), '%Y-%m-%d')`;

const OPEN_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
];

/* ------------------------------------------------------------------ */
/* Live stream                                                         */
/* ------------------------------------------------------------------ */

/** Every order and registration on the platform, as it happens. */
adminRouter.get(
  '/events',
  asyncHandler(async (_req, res) => {
    subscribePlatform(res);
  }),
);

/* ------------------------------------------------------------------ */
/* Platform overview                                                   */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const today = platformDayStart(0);
    const days30 = platformDayStart(29);
    const days14 = platformDayStart(13);
    const deliveredTotal = sql`case when ${orders.status} = ${OrderStatus.DELIVERED} then ${orders.total} else 0 end`;

    const [restaurantCounts, orderCounts, customerCount, series, top, recent, pending] =
      await Promise.all([
        db
          .select({
            total: sql<number>`count(*)`,
            active: sql<number>`sum(${restaurants.status} = ${RestaurantStatus.ACTIVE})`,
            pending: sql<number>`sum(${restaurants.status} = ${RestaurantStatus.PENDING})`,
            suspended: sql<number>`sum(${restaurants.status} = ${RestaurantStatus.SUSPENDED})`,
            inactive: sql<number>`sum(${restaurants.status} = ${RestaurantStatus.INACTIVE})`,
          })
          .from(restaurants)
          .where(isNull(restaurants.deletedAt)),

        db
          .select({
            allTime: sql<number>`count(*)`,
            allTimeGmv: sql<string>`coalesce(sum(${deliveredTotal}), 0)`,
            today: sql<number>`sum(${orders.placedAt} >= ${today})`,
            todayGmv: sql<string>`coalesce(sum(case when ${orders.placedAt} >= ${today} then ${deliveredTotal} else 0 end), 0)`,
            last30: sql<number>`sum(${orders.placedAt} >= ${days30})`,
            last30Gmv: sql<string>`coalesce(sum(case when ${orders.placedAt} >= ${days30} then ${deliveredTotal} else 0 end), 0)`,
            last30Delivered: sql<number>`sum(${orders.placedAt} >= ${days30} and ${orders.status} = ${OrderStatus.DELIVERED})`,
            last30Cancelled: sql<number>`sum(${orders.placedAt} >= ${days30} and ${orders.status} in (${OrderStatus.CANCELLED}, ${OrderStatus.REJECTED}))`,
            open: sql<number>`sum(${inArray(orders.status, OPEN_STATUSES)})`,
            pendingNow: sql<number>`sum(${orders.status} = ${OrderStatus.PENDING})`,
          })
          .from(orders),

        db.select({ count: sql<number>`count(*)` }).from(customers),

        db
          .select({
            day: localDay(orders.placedAt),
            orders: sql<number>`count(*)`,
            gmv: sql<string>`coalesce(sum(${deliveredTotal}), 0)`,
          })
          .from(orders)
          .where(gte(orders.placedAt, days14))
          .groupBy(sql`1`)
          .orderBy(sql`1`),

        db
          .select({
            id: restaurants.id,
            name: restaurants.name,
            orders: sql<number>`count(*)`,
            gmv: sql<string>`coalesce(sum(${deliveredTotal}), 0)`,
          })
          .from(orders)
          .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
          .where(gte(orders.placedAt, days30))
          .groupBy(restaurants.id, restaurants.name)
          .orderBy(desc(sql`count(*)`))
          .limit(5),

        db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            placedAt: orders.placedAt,
            customerName: orders.customerName,
            total: orders.total,
            restaurantId: orders.restaurantId,
            restaurantName: restaurants.name,
          })
          .from(orders)
          .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
          .orderBy(desc(orders.placedAt))
          .limit(8),

        db
          .select({
            id: restaurants.id,
            name: restaurants.name,
            email: restaurants.email,
            phone: restaurants.phone,
            address: restaurants.address,
            createdAt: restaurants.createdAt,
          })
          .from(restaurants)
          .where(and(eq(restaurants.status, RestaurantStatus.PENDING), isNull(restaurants.deletedAt)))
          .orderBy(asc(restaurants.createdAt))
          .limit(6),
      ]);

    // Fill gaps so the chart has one bar per day, including quiet ones.
    const byDay = new Map(series.map((row) => [row.day, row]));
    const filled = Array.from({ length: 14 }, (_, index) => {
      const start = platformDayStart(13 - index);
      const key = new Date(start.getTime() + OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
      const row = byDay.get(key);
      return { date: key, orders: toInt(row?.orders), gmvMinor: toMinor(row?.gmv) };
    });

    const r = restaurantCounts[0];
    const o = orderCounts[0];
    const decided30 = toInt(o?.last30Delivered) + toInt(o?.last30Cancelled);

    ok(res, {
      restaurants: {
        total: toInt(r?.total),
        active: toInt(r?.active),
        pending: toInt(r?.pending),
        suspended: toInt(r?.suspended),
        inactive: toInt(r?.inactive),
      },
      orders: {
        allTime: toInt(o?.allTime),
        allTimeGmvMinor: toMinor(o?.allTimeGmv),
        today: toInt(o?.today),
        todayGmvMinor: toMinor(o?.todayGmv),
        last30: toInt(o?.last30),
        last30GmvMinor: toMinor(o?.last30Gmv),
        open: toInt(o?.open),
        pending: toInt(o?.pendingNow),
        // Share of finished orders that failed. Null until there is a sample.
        cancellationRate30: decided30 > 0 ? Math.round((toInt(o?.last30Cancelled) / decided30) * 100) : null,
      },
      customers: { total: toInt(customerCount[0]?.count) },
      series: filled,
      topRestaurants: top.map((row) => ({
        id: row.id,
        name: row.name,
        orders: toInt(row.orders),
        gmvMinor: toMinor(row.gmv),
      })),
      recentOrders: recent.map(({ total, ...row }) => ({ ...row, totalMinor: toMinor(total) })),
      pendingApprovals: pending,
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Restaurants                                                         */
/* ------------------------------------------------------------------ */

const listQuerySchema = paginationSchema.extend({
  search: searchSchema,
  status: z.enum(enumValues(RestaurantStatus)).optional(),
  sort: z.enum(['rank', 'newest', 'oldest', 'name', 'orders']).default('rank'),
});

/** The first owner's email, without a join that could duplicate rows. */
const ownerEmail = sql<string | null>`(
  select u.email from restaurant_users ru
  inner join users u on u.id = ru.user_id
  where ru.restaurant_id = ${restaurants.id}
  order by (ru.role = 'OWNER') desc, ru.id asc
  limit 1
)`;
const orderCount = sql<number>`(select count(*) from orders o where o.restaurant_id = ${restaurants.id})`;

adminRouter.get(
  '/restaurants',
  validateQuery(listQuerySchema),
  asyncHandler(async (_req, res) => {
    const query = validatedQuery<z.infer<typeof listQuerySchema>>(res);

    const filters = [isNull(restaurants.deletedAt)];
    if (query.status) filters.push(eq(restaurants.status, query.status));
    if (query.search) {
      const term = likeTerm(query.search);
      filters.push(
        or(
          like(restaurants.name, term),
          like(restaurants.email, term),
          like(restaurants.phone, term),
          like(restaurants.slug, term),
        )!,
      );
    }
    const where = and(...filters);

    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(restaurants)
      .where(where);

    const orderBy =
      query.sort === 'name'
        ? [asc(restaurants.name)]
        : query.sort === 'newest'
          ? [desc(restaurants.createdAt)]
          : query.sort === 'oldest'
            ? [asc(restaurants.createdAt)]
            : query.sort === 'orders'
              ? [desc(orderCount)]
              : // Pinned slots first, then organic score.
                [
                  sql`${restaurantRankings.pinnedPosition} is null`,
                  asc(restaurantRankings.pinnedPosition),
                  desc(restaurantRankings.score),
                ];

    const rows = await db
      .select({
        id: restaurants.id,
        slug: restaurants.slug,
        name: restaurants.name,
        email: restaurants.email,
        phone: restaurants.phone,
        address: restaurants.address,
        status: restaurants.status,
        statusReason: restaurants.suspendedReason,
        isOpen: restaurants.isOpen,
        hasLocation: sql<number>`${restaurants.latitude} is not null`,
        createdAt: restaurants.createdAt,
        approvedAt: restaurants.approvedAt,
        statusChangedAt: restaurants.statusChangedAt,
        ownerEmail,
        totalOrders: orderCount,
        whatsappStatus: restaurantSettings.whatsappStatus,
        score: restaurantRankings.score,
        manualBoost: restaurantRankings.manualBoost,
        pinnedPosition: restaurantRankings.pinnedPosition,
        popularityScore: restaurantRankings.popularityScore,
        loyaltyScore: restaurantRankings.loyaltyScore,
        reliabilityScore: restaurantRankings.reliabilityScore,
        completenessScore: restaurantRankings.completenessScore,
        freshnessScore: restaurantRankings.freshnessScore,
        orders30d: restaurantRankings.orders30d,
        computedAt: restaurantRankings.computedAt,
      })
      .from(restaurants)
      .leftJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
      .leftJoin(restaurantRankings, eq(restaurantRankings.restaurantId, restaurants.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage);

    paginated(
      res,
      rows.map((row) => ({ ...row, hasLocation: Boolean(Number(row.hasLocation)), totalOrders: toInt(row.totalOrders) })),
      { page: query.page, perPage: query.perPage, total: Number(count) },
    );
  }),
);

const restaurantParam = z.object({ restaurantId: idSchema });

/** Everything a Super Admin needs to decide whether to verify, block or deactivate. */
adminRouter.get(
  '/restaurants/:restaurantId',
  validateParams(restaurantParam),
  asyncHandler(async (_req, res) => {
    const { restaurantId } = validatedParams<{ restaurantId: number }>(res);

    const [restaurant] = await db
      .select({
        id: restaurants.id,
        slug: restaurants.slug,
        name: restaurants.name,
        description: restaurants.description,
        logoUrl: restaurants.logoUrl,
        phone: restaurants.phone,
        email: restaurants.email,
        address: restaurants.address,
        latitude: restaurants.latitude,
        longitude: restaurants.longitude,
        status: restaurants.status,
        statusReason: restaurants.suspendedReason,
        isOpen: restaurants.isOpen,
        onboardingStep: restaurants.onboardingStep,
        createdAt: restaurants.createdAt,
        approvedAt: restaurants.approvedAt,
        statusChangedAt: restaurants.statusChangedAt,
        acceptsOrders: restaurantSettings.acceptsOrders,
        minOrderAmount: restaurantSettings.minOrderAmount,
        defaultPrepTimeMinutes: restaurantSettings.defaultPrepTimeMinutes,
        whatsappNumber: restaurantSettings.whatsappNumber,
        whatsappStatus: restaurantSettings.whatsappStatus,
      })
      .from(restaurants)
      .leftJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
      .where(and(eq(restaurants.id, restaurantId), isNull(restaurants.deletedAt)))
      .limit(1);

    if (!restaurant) throw notFound('Restaurant not found.', 'RESTAURANT_NOT_FOUND');

    const days30 = platformDayStart(29);
    const tenant = eq(orders.restaurantId, restaurantId);

    const [members, orderStats, menu, zones, ranking, recentOrders, history] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          status: users.status,
          role: restaurantUsers.role,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(restaurantUsers)
        .innerJoin(users, eq(users.id, restaurantUsers.userId))
        .where(eq(restaurantUsers.restaurantId, restaurantId))
        .orderBy(asc(restaurantUsers.id)),

      db
        .select({
          total: sql<number>`count(*)`,
          delivered: sql<number>`sum(${orders.status} = ${OrderStatus.DELIVERED})`,
          cancelled: sql<number>`sum(${orders.status} = ${OrderStatus.CANCELLED})`,
          rejected: sql<number>`sum(${orders.status} = ${OrderStatus.REJECTED})`,
          open: sql<number>`sum(${inArray(orders.status, OPEN_STATUSES)})`,
          gmv: sql<string>`coalesce(sum(case when ${orders.status} = ${OrderStatus.DELIVERED} then ${orders.total} else 0 end), 0)`,
          last30: sql<number>`sum(${orders.placedAt} >= ${days30})`,
          customers: sql<number>`count(distinct ${orders.customerId})`,
          lastOrderAt: sql<Date | null>`max(${orders.placedAt})`,
        })
        .from(orders)
        .where(tenant),

      Promise.all([
        db
          .select({ count: sql<number>`count(*)` })
          .from(categories)
          .where(and(eq(categories.restaurantId, restaurantId), isNull(categories.deletedAt))),
        db
          .select({
            count: sql<number>`count(*)`,
            available: sql<number>`sum(${foodItems.isAvailable} = 1)`,
          })
          .from(foodItems)
          .where(and(eq(foodItems.restaurantId, restaurantId), isNull(foodItems.deletedAt))),
      ]),

      db
        .select({
          id: deliveryZones.id,
          name: deliveryZones.name,
          minDistanceKm: deliveryZones.minDistanceKm,
          maxDistanceKm: deliveryZones.maxDistanceKm,
          deliveryFee: deliveryZones.deliveryFee,
          isActive: deliveryZones.isActive,
        })
        .from(deliveryZones)
        .where(eq(deliveryZones.restaurantId, restaurantId))
        .orderBy(asc(deliveryZones.minDistanceKm)),

      db.select().from(restaurantRankings).where(eq(restaurantRankings.restaurantId, restaurantId)).limit(1),

      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          placedAt: orders.placedAt,
          customerName: orders.customerName,
          customerPhone: orders.customerPhone,
          total: orders.total,
        })
        .from(orders)
        .where(tenant)
        .orderBy(desc(orders.placedAt))
        .limit(10),

      db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
          actorEmail: users.email,
          actorName: users.name,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .where(eq(auditLogs.restaurantId, restaurantId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(30),
    ]);

    const stats = orderStats[0];
    const [categoryRows, itemRows] = menu;
    const { minOrderAmount, ...restaurantRest } = restaurant;

    ok(res, {
      restaurant: { ...restaurantRest, minOrderMinor: toMinor(minOrderAmount) },
      members,
      stats: {
        totalOrders: toInt(stats?.total),
        delivered: toInt(stats?.delivered),
        cancelled: toInt(stats?.cancelled),
        rejected: toInt(stats?.rejected),
        open: toInt(stats?.open),
        orders30d: toInt(stats?.last30),
        customers: toInt(stats?.customers),
        gmvMinor: toMinor(stats?.gmv),
        lastOrderAt: toIso(stats?.lastOrderAt),
      },
      menu: {
        categories: toInt(categoryRows[0]?.count),
        items: toInt(itemRows[0]?.count),
        availableItems: toInt(itemRows[0]?.available),
      },
      zones: zones.map(({ deliveryFee, ...zone }) => ({ ...zone, feeMinor: toMinor(deliveryFee) })),
      ranking: ranking[0] ?? null,
      recentOrders: recentOrders.map(({ total, ...row }) => ({ ...row, totalMinor: toMinor(total) })),
      history,
    });
  }),
);

/** Human names for the status changes, as they appear in the activity log. */
function statusAction(from: RestaurantStatus, to: RestaurantStatus): string {
  if (to === RestaurantStatus.ACTIVE) {
    return from === RestaurantStatus.PENDING
      ? 'restaurant.verified'
      : from === RestaurantStatus.SUSPENDED
        ? 'restaurant.unblocked'
        : 'restaurant.reactivated';
  }
  if (to === RestaurantStatus.SUSPENDED) return 'restaurant.blocked';
  if (to === RestaurantStatus.INACTIVE) return 'restaurant.deactivated';
  return 'restaurant.returned_to_review';
}

/**
 * Verify, block, deactivate or restore a restaurant.
 *
 *   PENDING   → ACTIVE      verify (approve the application)
 *   any       → SUSPENDED   block: hidden, no orders, owner locked out
 *   any       → INACTIVE    deactivate: hidden, no orders, owner can still sign in
 *   SUSPENDED/INACTIVE → ACTIVE   restore
 */
adminRouter.patch(
  '/restaurants/:restaurantId/status',
  validateParams(restaurantParam),
  validateBody(adminUpdateRestaurantStatusSchema),
  asyncHandler(async (req, res) => {
    const { restaurantId } = validatedParams<{ restaurantId: number }>(res);
    const { status, reason } = req.body as AdminUpdateRestaurantStatusInput;

    const [existing] = await db
      .select({ id: restaurants.id, status: restaurants.status, approvedAt: restaurants.approvedAt })
      .from(restaurants)
      .where(and(eq(restaurants.id, restaurantId), isNull(restaurants.deletedAt)))
      .limit(1);
    if (!existing) throw notFound('Restaurant not found.', 'RESTAURANT_NOT_FOUND');
    if (existing.status === status) {
      throw conflict(`This restaurant is already ${status.toLowerCase()}.`, 'STATUS_UNCHANGED');
    }

    const now = new Date();
    const takesOffline = status === RestaurantStatus.SUSPENDED || status === RestaurantStatus.INACTIVE;

    await db
      .update(restaurants)
      .set({
        status,
        suspendedReason: takesOffline ? (reason ?? null) : null,
        statusChangedAt: now,
        ...(status === RestaurantStatus.ACTIVE && !existing.approvedAt ? { approvedAt: now } : {}),
      })
      .where(eq(restaurants.id, restaurantId));

    // Status feeds the score, so the listing must not lag behind the change.
    const breakdown = await recomputeRanking(restaurantId);
    await writeAudit({
      actorUserId: authOf(req).userId,
      action: statusAction(existing.status, status),
      restaurantId,
      metadata: { from: existing.status, to: status, reason: reason ?? null },
      ip: req.ip,
    });

    // An open dashboard re-renders at once rather than on its next request.
    emitRealtime({
      type: 'restaurant.status',
      restaurantId,
      status,
      reason: takesOffline ? (reason ?? null) : null,
    });

    ok(res, { restaurantId, status, score: breakdown?.score ?? 0 });
  }),
);

/* ------------------------------------------------------------------ */
/* Orders — the platform-wide history                                  */
/* ------------------------------------------------------------------ */

/** Accepts `status=PENDING&status=READY` or `status=PENDING,READY`. */
const statusListSchema = z.preprocess(
  (value) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  z.array(z.enum(enumValues(OrderStatus))).max(8).optional(),
);

const adminOrderListSchema = paginationSchema.extend({
  status: statusListSchema,
  restaurantId: idSchema.optional(),
  search: searchSchema,
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(['newest', 'oldest', 'total_high', 'total_low']).default('newest'),
});

adminRouter.get(
  '/orders',
  validateQuery(adminOrderListSchema),
  asyncHandler(async (_req, res) => {
    const query = validatedQuery<z.infer<typeof adminOrderListSchema>>(res);

    const filters: SQL[] = [];
    if (query.status?.length) filters.push(inArray(orders.status, query.status));
    if (query.restaurantId) filters.push(eq(orders.restaurantId, query.restaurantId));
    if (query.from) filters.push(gte(orders.placedAt, platformDate(query.from)));
    if (query.to) {
      const end = platformDate(query.to);
      end.setTime(end.getTime() + 86_400_000);
      filters.push(lt(orders.placedAt, end));
    }
    if (query.search) {
      const term = likeTerm(query.search);
      filters.push(
        or(
          like(orders.orderNumber, term),
          like(orders.customerName, term),
          like(orders.customerPhone, term),
          like(restaurants.name, term),
          like(orders.trackingCode, likeTerm(normaliseTrackingCode(query.search))),
        )!,
      );
    }
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [[totals], rows] = await Promise.all([
      db
        .select({
          count: sql<number>`count(*)`,
          gmv: sql<string>`coalesce(sum(case when ${orders.status} = ${OrderStatus.DELIVERED} then ${orders.total} else 0 end), 0)`,
        })
        .from(orders)
        .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
        .where(where),
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          trackingCode: orders.trackingCode,
          status: orders.status,
          placedAt: orders.placedAt,
          customerName: orders.customerName,
          customerPhone: orders.customerPhone,
          deliveryAddress: orders.deliveryAddress,
          distanceKm: orders.distanceKm,
          subtotal: orders.subtotal,
          deliveryFee: orders.deliveryFee,
          total: orders.total,
          paymentMethod: orders.paymentMethod,
          paymentStatus: orders.paymentStatus,
          restaurantId: orders.restaurantId,
          restaurantName: restaurants.name,
          restaurantSlug: restaurants.slug,
        })
        .from(orders)
        .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
        .where(where)
        .orderBy(
          ...(query.sort === 'oldest'
            ? [asc(orders.placedAt)]
            : query.sort === 'total_high'
              ? [desc(orders.total)]
              : query.sort === 'total_low'
                ? [asc(orders.total)]
                : [desc(orders.placedAt)]),
        )
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
    ]);

    const itemCounts = new Map<number, number>();
    if (rows.length > 0) {
      const counts = await db
        .select({ orderId: orderItems.orderId, quantity: sql<number>`sum(${orderItems.quantity})` })
        .from(orderItems)
        .where(inArray(orderItems.orderId, rows.map((row) => row.id)))
        .groupBy(orderItems.orderId);
      for (const row of counts) itemCounts.set(row.orderId, toInt(row.quantity));
    }

    res.status(200).json({
      data: rows.map(({ subtotal, deliveryFee, total, ...row }) => ({
        ...row,
        subtotalMinor: toMinor(subtotal),
        deliveryFeeMinor: toMinor(deliveryFee),
        totalMinor: toMinor(total),
        itemCount: itemCounts.get(row.id) ?? 0,
      })),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total: toInt(totals?.count),
        totalPages: Math.max(1, Math.ceil(toInt(totals?.count) / query.perPage)),
        // Delivered value of everything matching the filter, not just this page.
        gmvMinor: toMinor(totals?.gmv),
      },
    });
  }),
);

const orderParam = z.object({ orderId: idSchema });

adminRouter.get(
  '/orders/:orderId',
  validateParams(orderParam),
  asyncHandler(async (_req, res) => {
    const { orderId } = validatedParams<{ orderId: number }>(res);

    const [order] = await db
      .select({
        order: orders,
        restaurantName: restaurants.name,
        restaurantSlug: restaurants.slug,
        restaurantPhone: restaurants.phone,
      })
      .from(orders)
      .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw notFound('Order not found.', 'ORDER_NOT_FOUND');

    const [items, history, notifications] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id)),
      db
        .select({
          id: orderStatusHistory.id,
          fromStatus: orderStatusHistory.fromStatus,
          toStatus: orderStatusHistory.toStatus,
          changedByActor: orderStatusHistory.changedByActor,
          note: orderStatusHistory.note,
          createdAt: orderStatusHistory.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(orderStatusHistory)
        .leftJoin(users, eq(users.id, orderStatusHistory.changedByUserId))
        .where(eq(orderStatusHistory.orderId, orderId))
        .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id)),
      db
        .select({
          id: notificationLogs.id,
          channel: notificationLogs.channel,
          status: notificationLogs.status,
          recipient: notificationLogs.recipient,
          error: notificationLogs.error,
          createdAt: notificationLogs.createdAt,
        })
        .from(notificationLogs)
        .where(eq(notificationLogs.orderId, orderId))
        .orderBy(asc(notificationLogs.createdAt)),
    ]);

    const o = order.order;
    ok(res, {
      id: o.id,
      orderNumber: o.orderNumber,
      trackingCode: o.trackingCode,
      status: o.status,
      placedAt: o.placedAt,
      acceptedAt: o.acceptedAt,
      readyAt: o.readyAt,
      deliveredAt: o.deliveredAt,
      restaurant: {
        id: o.restaurantId,
        name: order.restaurantName,
        slug: order.restaurantSlug,
        phone: order.restaurantPhone,
      },
      customer: { id: o.customerId, name: o.customerName, phone: o.customerPhone, email: o.customerEmail },
      delivery: {
        address: o.deliveryAddress,
        landmark: o.deliveryLandmark,
        latitude: o.deliveryLatitude,
        longitude: o.deliveryLongitude,
        distanceKm: o.distanceKm,
      },
      subtotalMinor: toMinor(o.subtotal),
      discountMinor: toMinor(o.discountTotal),
      deliveryFeeMinor: toMinor(o.deliveryFee),
      totalMinor: toMinor(o.total),
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      note: o.note,
      cancelledReason: o.cancelledReason,
      items: items.map((item) => ({
        id: item.id,
        name: menuItemLabel(item.nameSnapshot, item.selections),
        selections: item.selections ?? [],
        quantity: item.quantity,
        unitPriceMinor: toMinor(item.unitPrice),
        lineTotalMinor: toMinor(item.lineTotal),
        note: item.note,
      })),
      history,
      notifications,
    });
  }),
);

/**
 * Support intervention: move an order on the restaurant's behalf, e.g. cancel
 * one a restaurant has abandoned. Same transition table as the dashboard, with
 * the SUPER_ADMIN actor, and audited on top of the order's own history.
 */
adminRouter.patch(
  '/orders/:orderId/status',
  validateParams(orderParam),
  validateBody(updateOrderStatusSchema),
  asyncHandler(async (req, res) => {
    const { orderId } = validatedParams<{ orderId: number }>(res);
    const { status, reason } = req.body as UpdateOrderStatusInput;

    const [order] = await db
      .select({ restaurantId: orders.restaurantId, status: orders.status, orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw notFound('Order not found.', 'ORDER_NOT_FOUND');

    const { userId } = authOf(req);
    const result = await updateOrderStatus({
      restaurantId: order.restaurantId,
      orderId,
      to: status,
      actor: Actor.SUPER_ADMIN,
      userId,
      reason,
    });

    await writeAudit({
      actorUserId: userId,
      action: 'order.status_override',
      restaurantId: order.restaurantId,
      entityType: 'order',
      entityId: orderId,
      metadata: { orderNumber: order.orderNumber, from: order.status, to: status, reason: reason ?? null },
      ip: req.ip,
    });

    ok(res, result);
  }),
);

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

const remarkCountSql = sql<number>`(select count(*) from customer_remarks cr where cr.customer_id = ${customers.id})`;

adminRouter.get(
  '/customers',
  validateQuery(adminCustomerListSchema),
  asyncHandler(async (_req, res) => {
    const query = validatedQuery<z.infer<typeof adminCustomerListSchema>>(res);
    const filters: SQL[] = [];
    if (query.search) {
      filters.push(
        or(
          like(customers.name, likeTerm(query.search)),
          like(customers.phone, likeTerm(query.search)),
          like(customers.email, likeTerm(query.search)),
        )!,
      );
    }
    if (query.filter === 'blocked') filters.push(eq(customers.isBlocked, 1));
    if (query.filter === 'reported') filters.push(sql`${remarkCountSql} > 0`);
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [[{ count } = { count: 0 }], rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(customers).where(where),
      db
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          email: customers.email,
          hasAccount: sql<number>`${customers.userId} is not null`,
          isBlocked: customers.isBlocked,
          createdAt: customers.createdAt,
          reports: remarkCountSql,
          orders: sql<number>`count(${orders.id})`,
          delivered: sql<number>`coalesce(sum(${orders.status} = ${OrderStatus.DELIVERED}), 0)`,
          cancelled: sql<number>`coalesce(sum(${orders.status} in (${OrderStatus.CANCELLED}, ${OrderStatus.REJECTED})), 0)`,
          spent: sql<string>`coalesce(sum(case when ${orders.status} = ${OrderStatus.DELIVERED} then ${orders.total} else 0 end), 0)`,
          restaurants: sql<number>`count(distinct ${orders.restaurantId})`,
          lastOrderAt: sql<Date | null>`max(${orders.placedAt})`,
        })
        .from(customers)
        .leftJoin(orders, eq(orders.customerId, customers.id))
        .where(where)
        .groupBy(customers.id)
        // Most-reported first in the "reported" view; otherwise most recent activity.
        .orderBy(
          ...(query.filter === 'reported' ? [desc(remarkCountSql)] : []),
          desc(sql`max(${orders.placedAt})`),
          desc(customers.id),
        )
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
    ]);

    paginated(
      res,
      rows.map(({ spent, ...row }) => ({
        ...row,
        hasAccount: Boolean(Number(row.hasAccount)),
        isBlocked: row.isBlocked === 1,
        reports: toInt(row.reports),
        orders: toInt(row.orders),
        delivered: toInt(row.delivered),
        cancelled: toInt(row.cancelled),
        restaurants: toInt(row.restaurants),
        lastOrderAt: toIso(row.lastOrderAt),
        spentMinor: toMinor(spent),
      })),
      { page: query.page, perPage: query.perPage, total: Number(count) },
    );
  }),
);

const customerParam = z.object({ customerId: idSchema });

/** Everything needed to decide on a block: reports from every restaurant, orders, reviews. */
adminRouter.get(
  '/customers/:customerId',
  validateParams(customerParam),
  asyncHandler(async (_req, res) => {
    const { customerId } = validatedParams<{ customerId: number }>(res);
    const [customer] = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        userId: customers.userId,
        isBlocked: customers.isBlocked,
        blockedReason: customers.blockedReason,
        blockedAt: customers.blockedAt,
        createdAt: customers.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(customers)
      .leftJoin(users, eq(users.id, customers.userId))
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw notFound('Customer not found.', 'CUSTOMER_NOT_FOUND');

    const reporter = alias(users, 'reporter');
    const [remarks, recentOrders, reviews] = await Promise.all([
      db
        .select({
          id: customerRemarks.id,
          reason: customerRemarks.reason,
          note: customerRemarks.note,
          createdAt: customerRemarks.createdAt,
          restaurantId: customerRemarks.restaurantId,
          restaurantName: restaurants.name,
          orderId: customerRemarks.orderId,
          reportedBy: reporter.name,
          reporterRole: reporter.role,
        })
        .from(customerRemarks)
        .innerJoin(restaurants, eq(restaurants.id, customerRemarks.restaurantId))
        .leftJoin(reporter, eq(reporter.id, customerRemarks.createdByUserId))
        .where(eq(customerRemarks.customerId, customerId))
        .orderBy(desc(customerRemarks.createdAt)),
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          placedAt: orders.placedAt,
          total: orders.total,
          cancelledReason: orders.cancelledReason,
          restaurantName: restaurants.name,
        })
        .from(orders)
        .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
        .where(eq(orders.customerId, customerId))
        .orderBy(desc(orders.placedAt))
        .limit(20),
      db
        .select({
          id: orderReviews.id,
          rating: orderReviews.rating,
          comment: orderReviews.comment,
          createdAt: orderReviews.createdAt,
          restaurantName: restaurants.name,
        })
        .from(orderReviews)
        .innerJoin(restaurants, eq(restaurants.id, orderReviews.restaurantId))
        .where(eq(orderReviews.customerId, customerId))
        .orderBy(desc(orderReviews.createdAt))
        .limit(20),
    ]);

    ok(res, {
      customer: { ...customer, isBlocked: customer.isBlocked === 1, hasAccount: customer.userId !== null },
      remarks,
      orders: recentOrders.map(({ total, ...row }) => ({ ...row, totalMinor: toMinor(total) })),
      reviews,
    });
  }),
);

/**
 * Block or unblock a customer. A block covers the account *and* the phone
 * number: they are signed out everywhere, cannot sign in or order, and
 * cannot sign up again with the same phone.
 */
adminRouter.patch(
  '/customers/:customerId/block',
  validateParams(customerParam),
  validateBody(setCustomerBlockSchema),
  asyncHandler(async (req, res) => {
    const { customerId } = validatedParams<{ customerId: number }>(res);
    const { blocked, reason } = req.body as SetCustomerBlockInput;
    const { userId: adminId } = authOf(req);

    const [customer] = await db
      .select({ id: customers.id, userId: customers.userId, isBlocked: customers.isBlocked, name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw notFound('Customer not found.', 'CUSTOMER_NOT_FOUND');
    if ((customer.isBlocked === 1) === blocked) {
      throw conflict(blocked ? 'This customer is already blocked.' : 'This customer isn’t blocked.', 'STATUS_UNCHANGED');
    }

    await db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set(
          blocked
            ? { isBlocked: 1, blockedReason: reason ?? null, blockedAt: new Date(), blockedByUserId: adminId }
            : { isBlocked: 0, blockedReason: null, blockedAt: null, blockedByUserId: null },
        )
        .where(eq(customers.id, customerId));
      if (customer.userId) {
        await tx
          .update(users)
          .set({
            status: blocked ? UserStatus.SUSPENDED : UserStatus.ACTIVE,
            // Invalidate every access token now, not when it expires.
            ...(blocked ? { tokenVersion: sql`${users.tokenVersion} + 1` } : {}),
          })
          .where(eq(users.id, customer.userId));
      }
    });
    if (blocked && customer.userId) await revokeAllSessions(customer.userId);

    await writeAudit({
      actorUserId: adminId,
      action: blocked ? 'customer.blocked' : 'customer.unblocked',
      restaurantId: null,
      entityType: 'customer',
      entityId: customerId,
      metadata: { name: customer.name, reason: reason ?? null },
      ip: req.ip,
    });

    ok(res, { customerId, blocked });
  }),
);

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

const auditListSchema = paginationSchema.extend({
  restaurantId: idSchema.optional(),
  /** Prefix match, e.g. "restaurant." or "ranking.". */
  action: z.string().trim().max(80).regex(/^[a-z_.]*$/).optional(),
});

adminRouter.get(
  '/audit-logs',
  validateQuery(auditListSchema),
  asyncHandler(async (_req, res) => {
    const query = validatedQuery<z.infer<typeof auditListSchema>>(res);
    const filters: SQL[] = [];
    if (query.restaurantId) filters.push(eq(auditLogs.restaurantId, query.restaurantId));
    if (query.action) filters.push(like(auditLogs.action, `${query.action.replace(/_/g, '\\_')}%`));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [[{ count } = { count: 0 }], rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where),
      db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          metadata: auditLogs.metadata,
          ipAddress: auditLogs.ipAddress,
          createdAt: auditLogs.createdAt,
          restaurantId: auditLogs.restaurantId,
          restaurantName: restaurants.name,
          actorName: users.name,
          actorEmail: users.email,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .leftJoin(restaurants, eq(restaurants.id, auditLogs.restaurantId))
        .where(where)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
    ]);

    paginated(res, rows, { page: query.page, perPage: query.perPage, total: Number(count) });
  }),
);

/* ------------------------------------------------------------------ */
/* Ranking controls                                                    */
/* ------------------------------------------------------------------ */

/** Full score breakdown plus the raw signals behind it. */
adminRouter.get(
  '/rankings/:restaurantId',
  validateParams(restaurantParam),
  asyncHandler(async (_req, res) => {
    const { restaurantId } = validatedParams<{ restaurantId: number }>(res);
    const signals = await collectSignals(restaurantId);
    if (!signals) throw notFound('Restaurant not found.', 'RESTAURANT_NOT_FOUND');

    const [row] = await db
      .select()
      .from(restaurantRankings)
      .where(eq(restaurantRankings.restaurantId, restaurantId))
      .limit(1);

    ok(res, { ranking: row ?? null, signals });
  }),
);

/**
 * Editorial adjustment. Deliberately a bounded nudge rather than a free score
 * override, so the organic model still does the bulk of the work.
 */
adminRouter.patch(
  '/rankings/:restaurantId',
  validateParams(restaurantParam),
  validateBody(
    z.object({
      manualBoost: z.coerce.number().int().min(-50).max(50).optional(),
      /** Null clears the pin and returns the restaurant to organic ranking. */
      pinnedPosition: z.coerce.number().int().min(1).max(100).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { restaurantId } = validatedParams<{ restaurantId: number }>(res);
    const body = req.body as { manualBoost?: number; pinnedPosition?: number | null };

    const [existing] = await db
      .select({ restaurantId: restaurantRankings.restaurantId })
      .from(restaurantRankings)
      .where(eq(restaurantRankings.restaurantId, restaurantId))
      .limit(1);
    if (!existing) throw notFound('Restaurant not found.', 'RESTAURANT_NOT_FOUND');

    await db
      .update(restaurantRankings)
      .set({
        ...(body.manualBoost !== undefined ? { manualBoost: body.manualBoost } : {}),
        ...(body.pinnedPosition !== undefined ? { pinnedPosition: body.pinnedPosition } : {}),
      })
      .where(eq(restaurantRankings.restaurantId, restaurantId));

    const breakdown = await recomputeRanking(restaurantId);
    await writeAudit({
      actorUserId: authOf(req).userId,
      action: 'ranking.adjust',
      restaurantId,
      metadata: body,
      ip: req.ip,
    });

    ok(res, { restaurantId, ...body, score: breakdown?.score ?? 0 });
  }),
);

/**
 * Drag-and-drop reorder: the client sends the restaurant ids in the order they
 * should appear, and each is pinned to its index. Ids left out are unpinned and
 * fall back to organic ranking.
 */
adminRouter.post(
  '/rankings/reorder',
  validateBody(
    z.object({
      order: z.array(idSchema).max(100),
      /** When true, every restaurant not listed has its pin cleared. */
      unpinOthers: z.boolean().default(true),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { order, unpinOthers } = req.body as { order: number[]; unpinOthers: boolean };

    const unique = [...new Set(order)];
    if (unique.length !== order.length) {
      throw badRequest('The order contains duplicate restaurants.', 'DUPLICATE_IDS');
    }

    // One transaction: a half-applied ordering would show duplicate positions.
    await db.transaction(async (tx) => {
      if (unpinOthers) {
        await tx
          .update(restaurantRankings)
          .set({ pinnedPosition: null })
          .where(
            unique.length > 0
              ? sql`${restaurantRankings.restaurantId} not in ${unique}`
              : sql`1 = 1`,
          );
      }
      for (const [index, restaurantId] of unique.entries()) {
        await tx
          .update(restaurantRankings)
          .set({ pinnedPosition: index + 1 })
          .where(eq(restaurantRankings.restaurantId, restaurantId));
      }
    });

    await writeAudit({
      actorUserId: authOf(req).userId,
      action: 'ranking.reorder',
      restaurantId: null,
      entityType: 'ranking',
      metadata: { order: unique },
      ip: req.ip,
    });

    const rows = await db
      .select({
        restaurantId: restaurantRankings.restaurantId,
        name: restaurants.name,
        pinnedPosition: restaurantRankings.pinnedPosition,
        score: restaurantRankings.score,
      })
      .from(restaurantRankings)
      .innerJoin(restaurants, eq(restaurants.id, restaurantRankings.restaurantId))
      .where(unique.length > 0 ? inArray(restaurantRankings.restaurantId, unique) : sql`1 = 0`)
      .orderBy(asc(restaurantRankings.pinnedPosition));

    ok(res, rows);
  }),
);

adminRouter.post(
  '/rankings/recompute',
  asyncHandler(async (req, res) => {
    const result = await recomputeAllRankings();
    await writeAudit({
      actorUserId: authOf(req).userId,
      action: 'ranking.recompute',
      restaurantId: null,
      entityType: 'ranking',
      metadata: result,
      ip: req.ip,
    });
    ok(res, result);
  }),
);
