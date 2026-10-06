import { Router } from 'express';
import { z } from 'zod';
import { deliveryQuoteSchema, publicRestaurantListQuerySchema } from '@nayaro/shared';
import { publicReadLimiter } from '../../http/middleware/rate-limit.js';
import {
  asyncHandler,
  validateBody,
  validateParams,
  validateQuery,
  validatedParams,
  validatedQuery,
} from '../../http/middleware/validate.js';
import { ok, paginated } from '../../http/respond.js';
import { getPublicRestaurant, listPublicRestaurants, quoteDelivery } from './public.service.js';
import type { DeliveryQuoteInput, PublicRestaurantListQueryInput } from '@nayaro/shared';

/** Unauthenticated customer-facing reads. No session, no tenant context. */
export const publicRouter: Router = Router();

publicRouter.use(publicReadLimiter);

const slugParamSchema = z.object({ slug: z.string().trim().min(1).max(120) });

publicRouter.get(
  '/restaurants',
  validateQuery(publicRestaurantListQuerySchema),
  asyncHandler(async (_req, res) => {
    const query = validatedQuery<PublicRestaurantListQueryInput>(res);
    const origin =
      query.latitude !== undefined && query.longitude !== undefined
        ? { latitude: query.latitude, longitude: query.longitude }
        : undefined;

    const { items, total } = await listPublicRestaurants({
      search: query.search,
      origin,
      page: query.page,
      perPage: query.perPage,
    });

    paginated(res, items, { page: query.page, perPage: query.perPage, total });
  }),
);

publicRouter.get(
  '/restaurants/:slug',
  validateParams(slugParamSchema),
  validateQuery(
    z.object({
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
    }),
  ),
  asyncHandler(async (_req, res) => {
    const { slug } = validatedParams<{ slug: string }>(res);
    const query = validatedQuery<{ latitude?: number; longitude?: number }>(res);
    const origin =
      query.latitude !== undefined && query.longitude !== undefined
        ? { latitude: query.latitude, longitude: query.longitude }
        : undefined;

    ok(res, await getPublicRestaurant(slug, origin));
  }),
);

/**
 * Advisory quote for the cart. The response is for display only — the order
 * endpoint recomputes distance and fee from scratch before accepting anything.
 */
publicRouter.post(
  '/delivery-quote',
  validateBody(deliveryQuoteSchema),
  asyncHandler(async (req, res) => {
    const { restaurantId, destination } = req.body as DeliveryQuoteInput;
    ok(res, await quoteDelivery(restaurantId, destination));
  }),
);
