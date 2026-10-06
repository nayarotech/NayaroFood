import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  WhatsAppStatus,
  confirmWhatsAppVerificationSchema,
  fromDecimalString,
  maskPhone,
  requestWhatsAppVerificationSchema,
  toDecimalString,
  updateRestaurantLocationSchema,
  updateRestaurantProfileSchema,
  updateRestaurantSettingsSchema,
  type ConfirmWhatsAppVerificationInput,
  type RequestWhatsAppVerificationInput,
  type UpdateRestaurantLocationInput,
  type UpdateRestaurantProfileInput,
  type UpdateRestaurantSettingsInput,
} from '@nayaro/shared';
import { env } from '../../config/env.js';
import { generateNumericCode, hashToken, safeEquals } from '../../lib/tokens.js';
import { pushEnabled, pushToRestaurant, removeSubscription, vapidPublicKey } from '../../lib/push.js';
import { listenerCount, subscribe } from '../realtime/events.js';
import { sendVerificationCode } from '../whatsapp/whatsapp.service.js';
import { otpRequestLimiter, otpVerifyLimiter } from '../../http/middleware/rate-limit.js';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  customers,
  orders,
  pushSubscriptions,
  restaurantCustomers,
  restaurantRankings,
  restaurantSettings,
  restaurants,
  whatsappVerifications,
} from '../../db/schema/index.js';
import { authOf, requireAuth, requireRestaurant, tenantOf } from '../../http/middleware/auth.js';
import { asyncHandler, validateBody } from '../../http/middleware/validate.js';
import { badRequest, conflict, notFound, tooManyRequests, unprocessable } from '../../http/errors.js';
import { created, noContent, ok } from '../../http/respond.js';
import {
  RANKING_WEIGHTS,
  collectSignals,
  recomputeRanking,
} from '../ranking/ranking.service.js';

/**
 * The tenant surface. Everything here is scoped by `tenantOf(req)`, which comes
 * from the caller's membership row — never from the request.
 */
export const restaurantRouter: Router = Router();

restaurantRouter.use(requireAuth, requireRestaurant);

restaurantRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);

    const [row] = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        slug: restaurants.slug,
        status: restaurants.status,
        onboardingStep: restaurants.onboardingStep,
        statusReason: restaurants.suspendedReason,
        description: restaurants.description,
        phone: restaurants.phone,
        email: restaurants.email,
        address: restaurants.address,
        latitude: restaurants.latitude,
        longitude: restaurants.longitude,
        logoUrl: restaurants.logoUrl,
        coverUrl: restaurants.coverUrl,
        isOpen: restaurants.isOpen,
        whatsappNumber: restaurantSettings.whatsappNumber,
        whatsappStatus: restaurantSettings.whatsappStatus,
        acceptsOrders: restaurantSettings.acceptsOrders,
        currency: restaurantSettings.currency,
        minOrderAmount: restaurantSettings.minOrderAmount,
        defaultPrepTimeMinutes: restaurantSettings.defaultPrepTimeMinutes,
        orderNumberPrefix: restaurantSettings.orderNumberPrefix,
      })
      .from(restaurants)
      .leftJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
      .where(eq(restaurants.id, restaurantId))
      .limit(1);

    if (!row) throw notFound('Restaurant not found.', 'RESTAURANT_NOT_FOUND');
    const { minOrderAmount, ...rest } = row;
    ok(res, {
      ...rest,
      minOrderMinor: fromDecimalString(minOrderAmount ?? '0'),
      whatsappEnabled: env.WHATSAPP_ENABLED,
    });
  }),
);

/**
 * The restaurant's own view of how it ranks, and what to fix.
 *
 * Showing the weights and the component scores is deliberate: a ranking a
 * restaurant cannot understand is one they cannot improve, and an opaque model
 * invites suspicion that placement is being sold.
 */
restaurantRouter.get(
  '/ranking',
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);

    const signals = await collectSignals(restaurantId);
    if (!signals) throw notFound('Restaurant not found.', 'RESTAURANT_NOT_FOUND');

    const breakdown = await recomputeRanking(restaurantId);

    const [ranking] = await db
      .select({
        score: restaurantRankings.score,
        pinnedPosition: restaurantRankings.pinnedPosition,
      })
      .from(restaurantRankings)
      .where(eq(restaurantRankings.restaurantId, restaurantId))
      .limit(1);

    // Ordered by how much score each fix is worth, so the top item is the one
    // most worth doing next.
    const suggestions: { action: string; detail: string; points: number }[] = [];
    if (env.WHATSAPP_ENABLED && !signals.whatsappVerified) {
      suggestions.push({
        action: 'Verify your WhatsApp number',
        detail: 'Unverified numbers cannot receive orders at all.',
        points: 20,
      });
    }
    if (!signals.hasLocation) {
      suggestions.push({
        action: 'Set your location on the map',
        detail: 'Without it we cannot calculate delivery distance, so nobody can order.',
        points: 22,
      });
    }
    if (signals.zoneCount === 0) {
      suggestions.push({
        action: 'Add delivery zones',
        detail: 'Customers cannot check out until at least one distance band exists.',
        points: 18,
      });
    }
    if (signals.itemCount < 5) {
      suggestions.push({
        action: 'Add more dishes',
        detail: `You have ${signals.itemCount}. Five or more counts as a complete menu.`,
        points: 14,
      });
    }
    if (signals.categoryCount < 2) {
      suggestions.push({
        action: 'Group your menu into categories',
        detail: 'Two or more sections make a menu easier to browse.',
        points: 8,
      });
    }
    if (signals.itemCount > 0 && signals.itemsWithImages / signals.itemCount < 0.5) {
      suggestions.push({
        action: 'Add photos to your dishes',
        detail: 'At least half your menu should have an image.',
        points: 8,
      });
    }
    if (!signals.hasLogo) {
      suggestions.push({ action: 'Upload a logo', detail: 'Helps customers recognise you.', points: 6 });
    }
    if (!signals.hasDescription) {
      suggestions.push({
        action: 'Write a short description',
        detail: 'A sentence about your food, at least 20 characters.',
        points: 4,
      });
    }

    ok(res, {
      score: ranking?.score ?? 0,
      promoted: ranking?.pinnedPosition !== null && ranking?.pinnedPosition !== undefined,
      weights: RANKING_WEIGHTS,
      breakdown,
      signals,
      suggestions: suggestions.sort((a, b) => b.points - a.points),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Profile, location and settings                                      */
/* ------------------------------------------------------------------ */

restaurantRouter.patch(
  '/profile',
  validateBody(updateRestaurantProfileSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const input = req.body as UpdateRestaurantProfileInput;

    await db
      .update(restaurants)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
      })
      .where(eq(restaurants.id, restaurantId));

    void recomputeRanking(restaurantId).catch(() => undefined);
    ok(res, { restaurantId });
  }),
);

/**
 * The origin for every delivery-distance calculation. Until this is set the
 * restaurant cannot take a single order, which is why it is the heaviest
 * single item in the completeness score.
 */
restaurantRouter.patch(
  '/location',
  validateBody(updateRestaurantLocationSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const input = req.body as UpdateRestaurantLocationInput;

    await db
      .update(restaurants)
      .set({
        latitude: input.latitude,
        longitude: input.longitude,
        ...(input.address !== undefined ? { address: input.address } : {}),
      })
      .where(eq(restaurants.id, restaurantId));

    void recomputeRanking(restaurantId).catch(() => undefined);
    ok(res, { latitude: input.latitude, longitude: input.longitude });
  }),
);

restaurantRouter.patch(
  '/settings',
  validateBody(updateRestaurantSettingsSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const input = req.body as UpdateRestaurantSettingsInput;

    await db
      .update(restaurantSettings)
      .set({
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.minOrderAmount !== undefined
          ? { minOrderAmount: toDecimalString(Math.round(input.minOrderAmount * 100)) }
          : {}),
        ...(input.defaultPrepTimeMinutes !== undefined
          ? { defaultPrepTimeMinutes: input.defaultPrepTimeMinutes }
          : {}),
        ...(input.acceptsOrders !== undefined ? { acceptsOrders: input.acceptsOrders ? 1 : 0 } : {}),
        ...(input.orderNumberPrefix !== undefined ? { orderNumberPrefix: input.orderNumberPrefix } : {}),
      })
      .where(eq(restaurantSettings.restaurantId, restaurantId));

    ok(res, { restaurantId });
  }),
);

/** The restaurant's own open/closed switch, independent of platform status. */
restaurantRouter.patch(
  '/open',
  validateBody(z.object({ isOpen: z.boolean() })),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { isOpen } = req.body as { isOpen: boolean };
    await db.update(restaurants).set({ isOpen: isOpen ? 1 : 0 }).where(eq(restaurants.id, restaurantId));
    ok(res, { isOpen });
  }),
);

/* ------------------------------------------------------------------ */
/* WhatsApp number verification                                        */
/* ------------------------------------------------------------------ */

/**
 * Send a one-time code to a candidate WhatsApp number.
 *
 * The number is stored immediately but marked PENDING — it cannot receive a
 * single order until the code comes back. Only the SHA-256 hash of the code is
 * persisted, so a leaked row cannot be turned back into a working code.
 */
/** WhatsApp is switched off until the integration ships; say so plainly. */
const requireWhatsApp: RequestHandler = (_req, _res, next) => {
  if (!env.WHATSAPP_ENABLED) {
    next(unprocessable('WhatsApp notifications are coming soon.', 'WHATSAPP_DISABLED'));
    return;
  }
  next();
};

restaurantRouter.post(
  '/whatsapp/request',
  requireWhatsApp,
  otpRequestLimiter,
  validateBody(requestWhatsAppVerificationSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { whatsappNumber } = req.body as RequestWhatsAppVerificationInput;

    // Cooldown, so the button cannot be used to spam someone's phone.
    const [recent] = await db
      .select({ createdAt: whatsappVerifications.createdAt })
      .from(whatsappVerifications)
      .where(
        and(
          eq(whatsappVerifications.restaurantId, restaurantId),
          eq(whatsappVerifications.phone, whatsappNumber),
        ),
      )
      .orderBy(desc(whatsappVerifications.createdAt))
      .limit(1);

    if (recent) {
      const elapsed = (Date.now() - recent.createdAt.getTime()) / 1000;
      if (elapsed < env.OTP_RESEND_COOLDOWN_SECONDS) {
        throw tooManyRequests(
          `Please wait ${Math.ceil(env.OTP_RESEND_COOLDOWN_SECONDS - elapsed)} seconds before requesting another code.`,
          'OTP_COOLDOWN',
        );
      }
    }

    const code = generateNumericCode(env.OTP_LENGTH);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60 * 1000);

    await db.transaction(async (tx) => {
      // Any earlier live code for this number is retired, so only one works.
      await tx
        .update(whatsappVerifications)
        .set({ invalidatedAt: new Date() })
        .where(
          and(
            eq(whatsappVerifications.restaurantId, restaurantId),
            eq(whatsappVerifications.phone, whatsappNumber),
            isNull(whatsappVerifications.consumedAt),
            isNull(whatsappVerifications.invalidatedAt),
          ),
        );

      await tx.insert(whatsappVerifications).values({
        restaurantId,
        phone: whatsappNumber,
        codeHash: hashToken(code),
        expiresAt,
        maxAttempts: env.OTP_MAX_ATTEMPTS,
        requestedByUserId: authOf(req).userId,
        requestIp: req.ip?.slice(0, 45) ?? null,
      });

      await tx
        .update(restaurantSettings)
        .set({
          whatsappNumber,
          whatsappStatus: WhatsAppStatus.PENDING,
          whatsappVerifiedAt: null,
        })
        .where(eq(restaurantSettings.restaurantId, restaurantId));
    });

    await sendVerificationCode(restaurantId, whatsappNumber, code, env.OTP_TTL_MINUTES);

    // The code itself is never returned — it only ever travels over WhatsApp.
    created(res, { phone: maskPhone(whatsappNumber), expiresAt });
  }),
);

restaurantRouter.post(
  '/whatsapp/confirm',
  requireWhatsApp,
  otpVerifyLimiter,
  validateBody(confirmWhatsAppVerificationSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { whatsappNumber, code } = req.body as ConfirmWhatsAppVerificationInput;

    const [row] = await db
      .select()
      .from(whatsappVerifications)
      .where(
        and(
          eq(whatsappVerifications.restaurantId, restaurantId),
          eq(whatsappVerifications.phone, whatsappNumber),
          isNull(whatsappVerifications.consumedAt),
          isNull(whatsappVerifications.invalidatedAt),
        ),
      )
      .orderBy(desc(whatsappVerifications.createdAt))
      .limit(1);

    if (!row) throw badRequest('Request a new verification code.', 'NO_PENDING_CODE');

    if (row.expiresAt.getTime() <= Date.now()) {
      throw badRequest('That code has expired. Request a new one.', 'CODE_EXPIRED');
    }
    if (row.attempts >= row.maxAttempts) {
      throw tooManyRequests('Too many incorrect attempts. Request a new code.', 'CODE_ATTEMPTS_EXCEEDED');
    }

    // Constant-time compare of hashes, so timing cannot leak the code.
    if (!safeEquals(hashToken(code), row.codeHash)) {
      await db
        .update(whatsappVerifications)
        .set({ attempts: row.attempts + 1 })
        .where(eq(whatsappVerifications.id, row.id));
      throw badRequest(
        `Incorrect code. ${row.maxAttempts - row.attempts - 1} attempts remaining.`,
        'CODE_INCORRECT',
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(whatsappVerifications)
        .set({ consumedAt: new Date() })
        .where(eq(whatsappVerifications.id, row.id));

      await tx
        .update(restaurantSettings)
        .set({ whatsappStatus: WhatsAppStatus.VERIFIED, whatsappVerifiedAt: new Date() })
        .where(eq(restaurantSettings.restaurantId, restaurantId));
    });

    void recomputeRanking(restaurantId).catch(() => undefined);
    ok(res, { status: WhatsAppStatus.VERIFIED, phone: maskPhone(whatsappNumber) });
  }),
);

/* ------------------------------------------------------------------ */
/* Customers — repeat-customer reporting                               */
/* ------------------------------------------------------------------ */

/**
 * The restaurant's own customer base.
 *
 * Read from `restaurant_customers`, which is scoped per tenant, so one
 * restaurant can never see who orders from another.
 */
restaurantRouter.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);

    const rows = await db
      .select({
        customerId: restaurantCustomers.customerId,
        name: customers.name,
        phone: customers.phone,
        orderCount: restaurantCustomers.orderCount,
        totalSpent: restaurantCustomers.totalSpent,
        cancelledCount: restaurantCustomers.cancelledCount,
        firstOrderAt: restaurantCustomers.firstOrderAt,
        lastOrderAt: restaurantCustomers.lastOrderAt,
      })
      .from(restaurantCustomers)
      .innerJoin(customers, eq(customers.id, restaurantCustomers.customerId))
      .where(eq(restaurantCustomers.restaurantId, restaurantId))
      .orderBy(desc(restaurantCustomers.orderCount), desc(restaurantCustomers.lastOrderAt))
      .limit(200);

    const repeat = rows.filter((row) => row.orderCount > 1);

    ok(res, {
      summary: {
        total: rows.length,
        repeat: repeat.length,
        // The number that tells a restaurant whether its food is worth returning for.
        repeatRate: rows.length > 0 ? Math.round((repeat.length / rows.length) * 100) : 0,
        lifetimeValueMinor: rows.reduce((sum, row) => sum + fromDecimalString(row.totalSpent), 0),
      },
      customers: rows.map((row) => ({
        ...row,
        totalSpentMinor: fromDecimalString(row.totalSpent),
        isRepeat: row.orderCount > 1,
      })),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Realtime + push registration                                        */
/* ------------------------------------------------------------------ */

/** Live event stream for an open dashboard. Scoped to the caller's tenant. */
restaurantRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    subscribe(tenantOf(req), res);
  }),
);

/** The public half of the VAPID keypair, needed by the browser to subscribe. */
restaurantRouter.get(
  '/push/key',
  asyncHandler(async (_req, res) => {
    ok(res, { publicKey: vapidPublicKey, enabled: pushEnabled });
  }),
);

restaurantRouter.post(
  '/push/subscribe',
  validateBody(
    z.object({
      endpoint: z.url().max(500),
      keys: z.object({ p256dh: z.string().max(255), auth: z.string().max(255) }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { endpoint, keys } = req.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    // Re-subscribing on the same device must update, not duplicate.
    await db
      .insert(pushSubscriptions)
      .values({
        restaurantId,
        userId: authOf(req).userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
      })
      .onDuplicateKeyUpdate({
        set: {
          restaurantId,
          userId: authOf(req).userId,
          p256dh: keys.p256dh,
          auth: keys.auth,
          lastFailureAt: null,
          lastError: null,
        },
      });

    created(res, { subscribed: true });
  }),
);

restaurantRouter.post(
  '/push/unsubscribe',
  validateBody(z.object({ endpoint: z.url().max(500) })),
  asyncHandler(async (req, res) => {
    await removeSubscription(tenantOf(req), (req.body as { endpoint: string }).endpoint);
    noContent(res);
  }),
);

/** Lets a restaurant confirm alerts actually reach their phone. */
restaurantRouter.post(
  '/push/test',
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    await pushToRestaurant(restaurantId, {
      title: 'Nayaro Food test alert',
      body: 'Push notifications are working. New orders will appear here.',
      url: '/dashboard/orders',
      tag: 'test',
    });
    ok(res, { sent: true, listeners: listenerCount(restaurantId) });
  }),
);
