import { Router } from 'express';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  createReviewSchema,
  fromDecimalString,
  paginationSchema,
  trackingCodeParamSchema,
  type CreateReviewInput,
  updateCustomerProfileSchema,
  type UpdateCustomerProfileInput,
} from '@nayaro/shared';
import { db } from '../../db/client.js';
import { customers, orderItems, orderReviews, orders, restaurants, users } from '../../db/schema/index.js';
import { authOf, customerOf, requireAuth, requireCustomer } from '../../http/middleware/auth.js';
import {
  asyncHandler,
  validateBody,
  validateParams,
  validateQuery,
  validatedParams,
  validatedQuery,
} from '../../http/middleware/validate.js';
import { conflict, notFound } from '../../http/errors.js';
import { ok, paginated } from '../../http/respond.js';

/**
 * The signed-in customer's own data: profile and order history. Everything is
 * keyed by the customer resolved from the session, never by a request id.
 */
export const customerRouter: Router = Router();

customerRouter.use(requireAuth, requireCustomer);

customerRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const { customerId } = customerOf(req);
    const [stats] = await db
      .select({
        orders: sql<number>`count(*)`,
        delivered: sql<number>`coalesce(sum(${orders.status} = 'DELIVERED'), 0)`,
      })
      .from(orders)
      .where(eq(orders.customerId, customerId));
    ok(res, { ...customerOf(req), orders: Number(stats?.orders ?? 0), delivered: Number(stats?.delivered ?? 0) });
  }),
);

/** Name and email. The phone is the account's identity and stays fixed. */
customerRouter.patch(
  '/me',
  validateBody(updateCustomerProfileSchema),
  asyncHandler(async (req, res) => {
    const { customerId } = customerOf(req);
    const { userId } = authOf(req);
    const input = req.body as UpdateCustomerProfileInput;

    if (input.email) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, input.email), ne(users.id, userId)))
        .limit(1);
      if (taken) throw conflict('Another account already uses that email.', 'EMAIL_TAKEN');
    }

    await db.transaction(async (tx) => {
      const userSet = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
      };
      if (Object.keys(userSet).length > 0) {
        await tx.update(users).set(userSet).where(eq(users.id, userId));
        await tx.update(customers).set(userSet).where(eq(customers.id, customerId));
      }
    });

    const [row] = await db
      .select({ name: customers.name, phone: customers.phone, email: customers.email })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    ok(res, row);
  }),
);

const ordersQuery = paginationSchema.extend({ perPage: z.coerce.number().int().min(1).max(50).default(15) });

customerRouter.get(
  '/orders',
  validateQuery(ordersQuery),
  asyncHandler(async (req, res) => {
    const { customerId } = customerOf(req);
    const query = validatedQuery<z.infer<typeof ordersQuery>>(res);
    const where = eq(orders.customerId, customerId);

    const [[{ count } = { count: 0 }], rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(orders).where(where),
      db
        .select({
          id: orders.id,
          trackingCode: orders.trackingCode,
          orderNumber: orders.orderNumber,
          status: orders.status,
          placedAt: orders.placedAt,
          total: orders.total,
          restaurantName: restaurants.name,
          restaurantSlug: restaurants.slug,
          restaurantLogo: restaurants.logoUrl,
        })
        .from(orders)
        .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
        .where(where)
        .orderBy(desc(orders.placedAt))
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
    ]);

    const summaries = new Map<number, string>();
    const reviews = new Map<number, { rating: number; comment: string }>();
    if (rows.length > 0) {
      const ownReviews = await db
        .select({ orderId: orderReviews.orderId, rating: orderReviews.rating, comment: orderReviews.comment })
        .from(orderReviews)
        .where(inArray(orderReviews.orderId, rows.map((r) => r.id)));
      for (const review of ownReviews) reviews.set(review.orderId, { rating: review.rating, comment: review.comment });

      const items = await db
        .select({ orderId: orderItems.orderId, name: orderItems.nameSnapshot, quantity: orderItems.quantity })
        .from(orderItems)
        .where(inArray(orderItems.orderId, rows.map((r) => r.id)));
      for (const item of items) {
        const text = `${item.quantity}× ${item.name}`;
        summaries.set(item.orderId, summaries.has(item.orderId) ? `${summaries.get(item.orderId)}, ${text}` : text);
      }
    }

    paginated(
      res,
      rows.map(({ id, total, ...row }) => ({
        ...row,
        totalMinor: fromDecimalString(total),
        items: summaries.get(id) ?? '',
        review: reviews.get(id) ?? null,
      })),
      { page: query.page, perPage: query.perPage, total: Number(count) },
    );
  }),
);

/** Is this tracking code one of mine? Returns my review of it, if any. */
customerRouter.get(
  '/orders/:code',
  validateParams(trackingCodeParamSchema),
  asyncHandler(async (req, res) => {
    const { customerId } = customerOf(req);
    const { code } = validatedParams<{ code: string }>(res);
    const [row] = await db
      .select({ id: orders.id, status: orders.status, rating: orderReviews.rating, comment: orderReviews.comment })
      .from(orders)
      .leftJoin(orderReviews, eq(orderReviews.orderId, orders.id))
      .where(and(eq(orders.trackingCode, code), eq(orders.customerId, customerId)))
      .limit(1);
    if (!row) throw notFound('Order not found.', 'ORDER_NOT_FOUND');
    ok(res, {
      status: row.status,
      review: row.rating === null ? null : { rating: row.rating, comment: row.comment ?? '' },
    });
  }),
);

/**
 * Rate a delivered order (1–5) with an optional comment. One review per
 * order; sending again updates it. The comment is seen only by the
 * restaurant — the public sees just the restaurant's average.
 */
customerRouter.put(
  '/orders/:code/review',
  validateParams(trackingCodeParamSchema),
  validateBody(createReviewSchema),
  asyncHandler(async (req, res) => {
    const { customerId } = customerOf(req);
    const { code } = validatedParams<{ code: string }>(res);
    const { rating, comment } = req.body as CreateReviewInput;

    const [order] = await db
      .select({ id: orders.id, status: orders.status, restaurantId: orders.restaurantId })
      .from(orders)
      .where(and(eq(orders.trackingCode, code), eq(orders.customerId, customerId)))
      .limit(1);
    if (!order) throw notFound('Order not found.', 'ORDER_NOT_FOUND');
    if (order.status !== 'DELIVERED') {
      throw conflict('You can review an order once it has been delivered.', 'ORDER_NOT_DELIVERED');
    }

    await db
      .insert(orderReviews)
      .values({ orderId: order.id, restaurantId: order.restaurantId, customerId, rating, comment })
      .onDuplicateKeyUpdate({ set: { rating, comment } });

    ok(res, { rating, comment });
  }),
);
