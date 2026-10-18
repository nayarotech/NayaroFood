import { Router } from 'express';
import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from 'drizzle-orm';
import {
  Actor,
  OrderStatus,
  RestaurantRole,
  StaffPermission,
  assignRiderSchema,
  type AssignRiderInput,
  UserRole,
  fromDecimalString,
  idSchema,
  customerCancelSchema,
  maskPhone,
  normaliseTrackingCode,
  orderListQuerySchema,
  placeOrderSchema,
  trackingCodeParamSchema,
  type CustomerCancelInput,
  trackOrderSchema,
  updateOrderStatusSchema,
  type OrderListQueryInput,
  type PlaceOrderInput,
  type TrackOrderInput,
  type UpdateOrderStatusInput,
} from '@nayaro/shared';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  customers,
  orderItems,
  orderReviews,
  orderStatusHistory,
  orders,
  restaurantSettings,
  restaurantUsers,
  restaurants,
  users,
} from '../../db/schema/index.js';
import { emitRealtime, emitToUser, subscribeOrder } from '../realtime/events.js';
import { pushToUser } from '../../lib/push.js';
import { flagsFor } from '../customer/remarks.service.js';
import {
  authOf,
  customerOf,
  optionalAuth,
  requireAuth,
  requireCustomer,
  requirePermission,
  requireRestaurant,
  tenantOf,
} from '../../http/middleware/auth.js';
import { orderLimiter, publicReadLimiter } from '../../http/middleware/rate-limit.js';
import {
  asyncHandler,
  validateBody,
  validateParams,
  validateQuery,
  validatedParams,
  validatedQuery,
} from '../../http/middleware/validate.js';
import { badRequest, conflict, notFound } from '../../http/errors.js';
import { created, ok, paginated } from '../../http/respond.js';
import { placeOrder, updateOrderStatus } from './orders.service.js';

/* ------------------------------------------------------------------ */
/* Public: checkout and tracking                                       */
/* ------------------------------------------------------------------ */

export const publicOrdersRouter: Router = Router();

/** Ordering needs a signed-in, unblocked customer account. */
publicOrdersRouter.post(
  '/orders',
  orderLimiter,
  requireAuth,
  requireCustomer,
  validateBody(placeOrderSchema),
  asyncHandler(async (req, res) => {
    created(res, await placeOrder(req.body as PlaceOrderInput, customerOf(req)));
  }),
);

/**
 * Order tracking for a customer with no account.
 *
 * The order number alone is guessable, so the phone number that placed the
 * order must match too — otherwise anyone could enumerate other people's
 * addresses by counting upward from #1001.
 */
publicOrdersRouter.post(
  '/orders/track',
  publicReadLimiter,
  validateBody(trackOrderSchema),
  asyncHandler(async (req, res) => {
    const { orderNumber, phone } = req.body as TrackOrderInput;

    const [order] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        trackingCode: orders.trackingCode,
        status: orders.status,
        placedAt: orders.placedAt,
        subtotal: orders.subtotal,
        deliveryFee: orders.deliveryFee,
        total: orders.total,
        distanceKm: orders.distanceKm,
        deliveryAddress: orders.deliveryAddress,
        restaurantName: restaurants.name,
        restaurantSlug: restaurants.slug,
      })
      .from(orders)
      .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
      .where(and(eq(orders.orderNumber, orderNumber), eq(orders.customerPhone, phone)))
      .orderBy(desc(orders.placedAt))
      .limit(1);

    if (!order) throw notFound('No order found with that number and phone.', 'ORDER_NOT_FOUND');

    const [items, history] = await Promise.all([
      db
        .select({ name: orderItems.nameSnapshot, quantity: orderItems.quantity, lineTotal: orderItems.lineTotal })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id)),
      db
        .select({ toStatus: orderStatusHistory.toStatus, createdAt: orderStatusHistory.createdAt })
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, order.id))
        .orderBy(asc(orderStatusHistory.createdAt)),
    ]);

    ok(res, {
      orderNumber: order.orderNumber,
      trackingCode: order.trackingCode,
      status: order.status,
      placedAt: order.placedAt,
      restaurant: { name: order.restaurantName, slug: order.restaurantSlug },
      deliveryAddress: order.deliveryAddress,
      distanceKm: order.distanceKm,
      subtotalMinor: fromDecimalString(order.subtotal),
      deliveryFeeMinor: fromDecimalString(order.deliveryFee),
      totalMinor: fromDecimalString(order.total),
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        lineTotalMinor: fromDecimalString(item.lineTotal),
      })),
      history,
    });
  }),
);

/**
 * The customer's tracking page, by tracking code.
 *
 * The code is ~10¹² combinations and handed only to the person who ordered,
 * so it works as a capability link they can share with whoever is receiving
 * the food. It reveals the order and its delivery address — but never the
 * customer's full phone number, and it cannot change anything on its own.
 */
publicOrdersRouter.get(
  '/orders/code/:code',
  publicReadLimiter,
  validateParams(trackingCodeParamSchema),
  asyncHandler(async (_req, res) => {
    const { code } = validatedParams<{ code: string }>(res);
    ok(res, await loadTracking(code));
  }),
);

/** Live status for one order, so the tracking page updates as the shop works. */
publicOrdersRouter.get(
  '/orders/code/:code/events',
  publicReadLimiter,
  validateParams(trackingCodeParamSchema),
  asyncHandler(async (_req, res) => {
    const { code } = validatedParams<{ code: string }>(res);
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.trackingCode, code))
      .limit(1);
    if (!order) throw notFound('No order found with that tracking code.', 'ORDER_NOT_FOUND');
    subscribeOrder(order.id, res);
  }),
);

/**
 * The customer changes their mind. Only while the restaurant has not yet
 * accepted, and only with the phone number the order was placed with — the
 * tracking code alone is shareable, so it must not be enough to cancel.
 */
publicOrdersRouter.post(
  '/orders/code/:code/cancel',
  orderLimiter,
  optionalAuth,
  validateParams(trackingCodeParamSchema),
  validateBody(customerCancelSchema),
  asyncHandler(async (req, res) => {
    const { code } = validatedParams<{ code: string }>(res);
    const { phone, reason } = req.body as CustomerCancelInput;

    const [order] = await db
      .select({
        id: orders.id,
        restaurantId: orders.restaurantId,
        customerPhone: orders.customerPhone,
        ownerUserId: customers.userId,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(orders.trackingCode, code))
      .limit(1);

    // The signed-in owner needs nothing else; anyone else must know the phone.
    const isOwner = Boolean(order && req.auth && order.ownerUserId === req.auth.userId);
    // Same answer for "no such order" and "wrong phone", so neither leaks.
    if (!order || (!isOwner && order.customerPhone !== phone)) {
      throw notFound('No order matches that tracking code and phone number.', 'ORDER_NOT_FOUND');
    }

    await updateOrderStatus({
      restaurantId: order.restaurantId,
      orderId: order.id,
      to: OrderStatus.CANCELLED,
      actor: Actor.CUSTOMER,
      userId: null,
      reason: reason?.trim() || 'Cancelled by the customer',
    });

    ok(res, await loadTracking(code));
  }),
);

/** Everything the tracking page shows, minus anything private. */
async function loadTracking(code: string) {
  const [row] = await db
    .select({
      order: orders,
      restaurantName: restaurants.name,
      restaurantSlug: restaurants.slug,
      restaurantPhone: restaurants.phone,
      restaurantAddress: restaurants.address,
      prepMinutes: restaurantSettings.defaultPrepTimeMinutes,
    })
    .from(orders)
    .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
    .leftJoin(restaurantSettings, eq(restaurantSettings.restaurantId, orders.restaurantId))
    .where(eq(orders.trackingCode, code))
    .limit(1);
  if (!row) throw notFound('No order found with that tracking code.', 'ORDER_NOT_FOUND');

  // The rider's name and phone, only once the food is on its way.
  const [rider] =
    row.order.riderUserId && row.order.status === OrderStatus.OUT_FOR_DELIVERY
      ? await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, row.order.riderUserId)).limit(1)
      : [];

  const order = row.order;
  const [items, history] = await Promise.all([
    db
      .select({
        name: orderItems.nameSnapshot,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        lineTotal: orderItems.lineTotal,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.id)),
    db
      .select({
        status: orderStatusHistory.toStatus,
        actor: orderStatusHistory.changedByActor,
        note: orderStatusHistory.note,
        at: orderStatusHistory.createdAt,
      })
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id)),
  ]);

  return {
    trackingCode: order.trackingCode,
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: order.placedAt,
    acceptedAt: order.acceptedAt,
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    /** A rough "ready by" for the customer; the kitchen's own typical time. */
    prepMinutes: row.prepMinutes ?? 30,
    cancelledReason: order.cancelledReason,
    restaurant: {
      name: row.restaurantName,
      slug: row.restaurantSlug,
      phone: row.restaurantPhone,
      address: row.restaurantAddress,
    },
    customer: { name: order.customerName, phone: maskPhone(order.customerPhone) },
    delivery: {
      address: order.deliveryAddress,
      landmark: order.deliveryLandmark,
      distanceKm: order.distanceKm,
    },
    paymentMethod: order.paymentMethod,
    note: order.note,
    rider: rider ? { name: rider.name, phone: rider.phone } : null,
    subtotalMinor: fromDecimalString(order.subtotal),
    deliveryFeeMinor: fromDecimalString(order.deliveryFee),
    totalMinor: fromDecimalString(order.total),
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: fromDecimalString(item.unitPrice),
      lineTotalMinor: fromDecimalString(item.lineTotal),
    })),
    // Staff notes stay internal; only reasons for a cancellation reach the customer.
    history: history.map((entry) => ({
      status: entry.status,
      at: entry.at,
      by: entry.actor,
    })),
  };
}

const ASSIGNABLE: string[] = ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

/* ------------------------------------------------------------------ */
/* Tenant: the restaurant's order dashboard                            */
/* ------------------------------------------------------------------ */

export const tenantOrdersRouter: Router = Router();

tenantOrdersRouter.use(requireAuth, requireRestaurant, requirePermission(StaffPermission.ORDERS));

tenantOrdersRouter.get(
  '/',
  validateQuery(orderListQuerySchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const query = validatedQuery<OrderListQueryInput>(res);

    const filters = [eq(orders.restaurantId, restaurantId)];
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      filters.push(inArray(orders.status, statuses));
    }
    if (query.customerId) filters.push(eq(orders.customerId, query.customerId));
    if (query.from) filters.push(gte(orders.placedAt, new Date(`${query.from}T00:00:00Z`)));
    if (query.to) filters.push(lte(orders.placedAt, new Date(`${query.to}T23:59:59Z`)));
    if (query.search) {
      const term = `%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      filters.push(
        or(
          like(orders.orderNumber, term),
          like(orders.customerName, term),
          like(orders.customerPhone, term),
          like(orders.trackingCode, `%${normaliseTrackingCode(query.search)}%`),
        )!,
      );
    }
    const where = and(...filters);

    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(where);

    const orderBy =
      query.sort === 'oldest'
        ? [asc(orders.placedAt)]
        : query.sort === 'total_high'
          ? [desc(orders.total)]
          : query.sort === 'total_low'
            ? [asc(orders.total)]
            : [desc(orders.placedAt)];

    const rows = await db.select().from(orders).where(where).orderBy(...orderBy)
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage);

    const itemsByOrder = new Map<number, { name: string; quantity: number }[]>();
    const riderIds = [...new Set(rows.map((row) => row.riderUserId).filter((id): id is number => id !== null))];
    const [flags, riders, reviews] = await Promise.all([
      flagsFor(rows.map((row) => row.customerId)),
      riderIds.length === 0
        ? Promise.resolve([] as { id: number; name: string }[])
        : db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, riderIds)),
      rows.length === 0
        ? Promise.resolve([] as { orderId: number; rating: number }[])
        : db
            .select({ orderId: orderReviews.orderId, rating: orderReviews.rating })
            .from(orderReviews)
            .where(inArray(orderReviews.orderId, rows.map((row) => row.id))),
    ]);
    const riderNames = new Map(riders.map((rider) => [rider.id, rider.name]));
    const ratings = new Map(reviews.map((review) => [review.orderId, review.rating]));
    if (rows.length > 0) {
      const items = await db
        .select({ orderId: orderItems.orderId, name: orderItems.nameSnapshot, quantity: orderItems.quantity })
        .from(orderItems)
        .where(inArray(orderItems.orderId, rows.map((row) => row.id)));
      for (const item of items) {
        const list = itemsByOrder.get(item.orderId) ?? [];
        list.push({ name: item.name, quantity: item.quantity });
        itemsByOrder.set(item.orderId, list);
      }
    }

    paginated(
      res,
      rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        trackingCode: row.trackingCode,
        status: row.status,
        placedAt: row.placedAt,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        deliveryAddress: row.deliveryAddress,
        distanceKm: row.distanceKm,
        subtotalMinor: fromDecimalString(row.subtotal),
        deliveryFeeMinor: fromDecimalString(row.deliveryFee),
        totalMinor: fromDecimalString(row.total),
        note: row.note,
        items: itemsByOrder.get(row.id) ?? [],
        customerId: row.customerId,
        // Platform-wide reports, so staff can think twice before accepting.
        customerReports: flags.get(row.customerId)?.reports ?? 0,
        customerBlocked: flags.get(row.customerId)?.blocked ?? false,
        rider: row.riderUserId ? { id: row.riderUserId, name: riderNames.get(row.riderUserId) ?? 'Rider' } : null,
        deliveryNote: row.deliveryNote,
        rating: ratings.get(row.id) ?? null,
      })),
      { page: query.page, perPage: query.perPage, total: Number(count) },
    );
  }),
);

/** Today's counters for the dashboard header. */
tenantOrdersRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [row] = await db
      .select({
        todayCount: sql<number>`count(*)`,
        todayRevenue: sql<string>`coalesce(sum(case when ${orders.status} = ${OrderStatus.DELIVERED} then ${orders.total} else 0 end), 0)`,
        pending: sql<number>`sum(case when ${orders.status} = ${OrderStatus.PENDING} then 1 else 0 end)`,
        accepted: sql<number>`sum(case when ${orders.status} = ${OrderStatus.ACCEPTED} then 1 else 0 end)`,
        preparing: sql<number>`sum(case when ${orders.status} = ${OrderStatus.PREPARING} then 1 else 0 end)`,
        ready: sql<number>`sum(case when ${orders.status} = ${OrderStatus.READY} then 1 else 0 end)`,
        outForDelivery: sql<number>`sum(case when ${orders.status} = ${OrderStatus.OUT_FOR_DELIVERY} then 1 else 0 end)`,
        delivered: sql<number>`sum(case when ${orders.status} = ${OrderStatus.DELIVERED} then 1 else 0 end)`,
      })
      .from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), gte(orders.placedAt, startOfDay)));

    // Live queues span days — a pending order from last night still needs action.
    const [live] = await db
      .select({
        openOrders: sql<number>`sum(case when ${orders.status} in (${OrderStatus.PENDING}, ${OrderStatus.ACCEPTED}, ${OrderStatus.PREPARING}, ${OrderStatus.READY}, ${OrderStatus.OUT_FOR_DELIVERY}) then 1 else 0 end)`,
        pendingNow: sql<number>`sum(case when ${orders.status} = ${OrderStatus.PENDING} then 1 else 0 end)`,
      })
      .from(orders)
      .where(eq(orders.restaurantId, restaurantId));

    ok(res, {
      today: {
        orders: Number(row?.todayCount ?? 0),
        revenueMinor: fromDecimalString(row?.todayRevenue ?? '0'),
        pending: Number(row?.pending ?? 0),
        accepted: Number(row?.accepted ?? 0),
        preparing: Number(row?.preparing ?? 0),
        ready: Number(row?.ready ?? 0),
        outForDelivery: Number(row?.outForDelivery ?? 0),
        delivered: Number(row?.delivered ?? 0),
      },
      openOrders: Number(live?.openOrders ?? 0),
      /** Every order still waiting for accept/reject, whatever day it arrived. */
      pendingNow: Number(live?.pendingNow ?? 0),
    });
  }),
);

/**
 * Assign an order to one of this restaurant's riders (or un-assign with null).
 * The rider gets it on their dashboard and phone straight away.
 */
tenantOrdersRouter.patch(
  '/:id/rider',
  requirePermission(StaffPermission.RIDERS),
  validateParams(z.object({ id: idSchema })),
  validateBody(assignRiderSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { id } = validatedParams<{ id: number }>(res);
    const { riderId } = req.body as AssignRiderInput;

    const [order] = await db
      .select({ id: orders.id, status: orders.status, orderNumber: orders.orderNumber, riderUserId: orders.riderUserId })
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.restaurantId, restaurantId)))
      .limit(1);
    if (!order) throw notFound('Order not found.', 'ORDER_NOT_FOUND');
    if (!ASSIGNABLE.includes(order.status)) {
      throw conflict('Only accepted orders that haven’t been delivered can be assigned.', 'ORDER_NOT_ASSIGNABLE');
    }

    if (riderId !== null) {
      const [rider] = await db
        .select({ id: restaurantUsers.userId })
        .from(restaurantUsers)
        .where(
          and(
            eq(restaurantUsers.restaurantId, restaurantId),
            eq(restaurantUsers.userId, riderId),
            eq(restaurantUsers.role, RestaurantRole.RIDER),
            eq(restaurantUsers.isActive, 1),
          ),
        )
        .limit(1);
      if (!rider) throw badRequest('That rider isn’t active at your restaurant.', 'RIDER_NOT_FOUND');
    }

    await db
      .update(orders)
      .set({ riderUserId: riderId, assignedAt: riderId === null ? null : new Date() })
      .where(eq(orders.id, order.id));

    emitRealtime({ type: 'order.assigned', restaurantId, orderId: order.id, riderUserId: riderId });
    if (order.riderUserId && order.riderUserId !== riderId) {
      emitToUser(order.riderUserId, { type: 'order.unassigned', orderId: order.id });
    }
    if (riderId !== null) {
      emitToUser(riderId, { type: 'order.assigned', orderId: order.id });
      void pushToUser(riderId, {
        title: `Delivery #${order.orderNumber} assigned to you`,
        body: 'Open the rider app for the address and items.',
        url: '/rider',
        tag: `rider-order-${order.id}`,
        orderId: order.id,
      });
    }

    ok(res, { id: order.id, riderId });
  }),
);

tenantOrdersRouter.patch(
  '/:id/status',
  validateParams(z.object({ id: idSchema })),
  validateBody(updateOrderStatusSchema),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    const { status, reason } = req.body as UpdateOrderStatusInput;
    const auth = authOf(req);

    ok(
      res,
      await updateOrderStatus({
        restaurantId: tenantOf(req),
        orderId: id,
        to: status,
        actor: auth.role === UserRole.SUPER_ADMIN ? Actor.SUPER_ADMIN : Actor.RESTAURANT,
        userId: auth.userId,
        reason,
      }),
    );
  }),
);
