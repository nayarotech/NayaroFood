import { Router } from 'express';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  Actor,
  OrderStatus,
  createRemarkSchema,
  deliveryNoteSchema,
  fromDecimalString,
  idSchema,
  paginationSchema,
  riderStatusSchema,
  type CreateRemarkInput,
  type RiderStatusInput,
} from '@nayaro/shared';
import { db } from '../../db/client.js';
import { customerRemarks, orderItems, orders, restaurants } from '../../db/schema/index.js';
import { authOf, requireAuth, requireRestaurant, requireRider, tenantOf } from '../../http/middleware/auth.js';
import {
  asyncHandler,
  validateBody,
  validateParams,
  validateQuery,
  validatedParams,
  validatedQuery,
} from '../../http/middleware/validate.js';
import { conflict, notFound } from '../../http/errors.js';
import { created, ok, paginated } from '../../http/respond.js';
import { subscribeUser } from '../realtime/events.js';
import { updateOrderStatus } from '../orders/orders.service.js';

/**
 * The rider app. Every query is keyed by the rider's own user id *and* their
 * restaurant, so a rider only ever sees the deliveries assigned to them.
 */
export const riderRouter: Router = Router();

riderRouter.use(requireAuth, requireRestaurant, requireRider);

const ACTIVE = [OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY];
const DONE = [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.REJECTED];

const mine = (req: Parameters<typeof tenantOf>[0]) =>
  and(eq(orders.restaurantId, tenantOf(req)), eq(orders.riderUserId, authOf(req).userId));

/** Today's numbers for the top of the rider screen. */
riderRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [[restaurant], [row]] = await Promise.all([
      db.select({ name: restaurants.name, phone: restaurants.phone }).from(restaurants).where(eq(restaurants.id, tenantOf(req))).limit(1),
      db
        .select({
          active: sql<number>`sum(${inArray(orders.status, ACTIVE)})`,
          deliveredToday: sql<number>`sum(${orders.status} = 'DELIVERED' and ${orders.deliveredAt} >= ${startOfDay})`,
          cashToday: sql<string>`coalesce(sum(case when ${orders.status} = 'DELIVERED' and ${orders.deliveredAt} >= ${startOfDay} then ${orders.total} else 0 end), 0)`,
          deliveredAll: sql<number>`sum(${orders.status} = 'DELIVERED')`,
        })
        .from(orders)
        .where(mine(req)),
    ]);
    ok(res, {
      restaurant: restaurant ?? null,
      active: Number(row?.active ?? 0),
      deliveredToday: Number(row?.deliveredToday ?? 0),
      cashCollectedTodayMinor: fromDecimalString(row?.cashToday ?? '0'),
      deliveredAllTime: Number(row?.deliveredAll ?? 0),
    });
  }),
);

const listQuery = paginationSchema.extend({ view: z.enum(['active', 'done']).default('active') });

riderRouter.get(
  '/orders',
  validateQuery(listQuery),
  asyncHandler(async (req, res) => {
    const query = validatedQuery<z.infer<typeof listQuery>>(res);
    const where = and(mine(req), inArray(orders.status, query.view === 'active' ? ACTIVE : DONE));

    const [[{ count } = { count: 0 }], rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(orders).where(where),
      db
        .select()
        .from(orders)
        .where(where)
        // Active: the oldest assignment first, so nothing waits. Done: most recent first.
        .orderBy(...(query.view === 'active' ? [asc(orders.assignedAt)] : [desc(orders.updatedAt)]))
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
    ]);

    const items = new Map<number, { name: string; quantity: number }[]>();
    if (rows.length > 0) {
      const lines = await db
        .select({ orderId: orderItems.orderId, name: orderItems.nameSnapshot, quantity: orderItems.quantity })
        .from(orderItems)
        .where(inArray(orderItems.orderId, rows.map((r) => r.id)));
      for (const line of lines) items.set(line.orderId, [...(items.get(line.orderId) ?? []), { name: line.name, quantity: line.quantity }]);
    }

    paginated(
      res,
      rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        placedAt: row.placedAt,
        assignedAt: row.assignedAt,
        pickedUpAt: row.pickedUpAt,
        deliveredAt: row.deliveredAt,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        address: row.deliveryAddress,
        landmark: row.deliveryLandmark,
        latitude: row.deliveryLatitude,
        longitude: row.deliveryLongitude,
        distanceKm: row.distanceKm,
        // Cash on delivery: what the rider collects at the door.
        collectMinor: fromDecimalString(row.total),
        note: row.note,
        deliveryNote: row.deliveryNote,
        cancelledReason: row.cancelledReason,
        items: items.get(row.id) ?? [],
      })),
      { page: query.page, perPage: query.perPage, total: Number(count) },
    );
  }),
);

const orderParam = z.object({ id: idSchema });

async function loadMine(req: Parameters<typeof tenantOf>[0], id: number) {
  const [order] = await db
    .select({ id: orders.id, status: orders.status, customerId: orders.customerId })
    .from(orders)
    .where(and(eq(orders.id, id), mine(req)))
    .limit(1);
  if (!order) throw notFound('That delivery isn’t assigned to you.', 'ORDER_NOT_FOUND');
  return order;
}

/** Picked up → delivered, or a failed delivery (needs a reason). */
riderRouter.patch(
  '/orders/:id/status',
  validateParams(orderParam),
  validateBody(riderStatusSchema),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    const { status, reason } = req.body as RiderStatusInput;
    await loadMine(req, id);
    ok(
      res,
      await updateOrderStatus({
        restaurantId: tenantOf(req),
        orderId: id,
        to: status,
        actor: Actor.RIDER,
        userId: authOf(req).userId,
        reason,
      }),
    );
  }),
);

/** The rider's own note on the delivery. */
riderRouter.put(
  '/orders/:id/note',
  validateParams(orderParam),
  validateBody(deliveryNoteSchema),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    const { note } = req.body as { note: string };
    await loadMine(req, id);
    await db.update(orders).set({ deliveryNote: note || null }).where(eq(orders.id, id));
    ok(res, { id, note });
  }),
);

/** Report the customer on this delivery — it lands with the restaurant's remarks. */
riderRouter.post(
  '/orders/:id/report',
  validateParams(orderParam),
  validateBody(createRemarkSchema),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    const input = req.body as CreateRemarkInput;
    const order = await loadMine(req, id);

    const [duplicate] = await db
      .select({ id: customerRemarks.id })
      .from(customerRemarks)
      .where(and(eq(customerRemarks.orderId, id), eq(customerRemarks.reason, input.reason)))
      .limit(1);
    if (duplicate) throw conflict('This has already been reported for this order.', 'REMARK_EXISTS');

    const [result] = await db.insert(customerRemarks).values({
      customerId: order.customerId,
      restaurantId: tenantOf(req),
      orderId: id,
      reason: input.reason,
      note: input.note,
      createdByUserId: authOf(req).userId,
    });
    created(res, { id: result.insertId });
  }),
);

/** Live stream of this rider's assignments. */
riderRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    subscribeUser(authOf(req).userId, res);
  }),
);

