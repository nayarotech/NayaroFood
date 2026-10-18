import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import {
  StaffPermission,
  createDeliveryZoneSchema,
  fromDecimalString,
  idSchema,
  replaceDeliveryZonesSchema,
  toDecimalString,
  updateDeliveryZoneSchema,
  zoneSetErrors,
  type CreateDeliveryZoneInput,
  type DeliveryZoneRule,
  type ReplaceDeliveryZonesInput,
  type UpdateDeliveryZoneInput,
} from '@nayaro/shared';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { deliveryZones } from '../../db/schema/index.js';
import { requireAuth, requirePermission,
  requireRestaurant, tenantOf } from '../../http/middleware/auth.js';
import {
  asyncHandler,
  validateBody,
  validateParams,
  validatedParams,
} from '../../http/middleware/validate.js';
import { notFound, unprocessable } from '../../http/errors.js';
import { created, noContent, ok } from '../../http/respond.js';
import { recomputeRanking } from '../ranking/ranking.service.js';

/**
 * Delivery zone management.
 *
 * Overlap cannot be expressed as a MySQL constraint, so it is enforced here:
 * every write is validated against the restaurant's *resulting* zone set, not
 * just the row being changed. Saving overlapping bands is rejected outright,
 * because ambiguous pricing is worse than no pricing.
 */
export const zonesRouter: Router = Router();

zonesRouter.use(requireAuth, requireRestaurant, requirePermission(StaffPermission.SETTINGS));

const idParam = z.object({ id: idSchema });

type ZoneRow = typeof deliveryZones.$inferSelect;

const toRule = (row: ZoneRow): DeliveryZoneRule => ({
  id: row.id,
  name: row.name,
  minDistanceKm: row.minDistanceKm,
  maxDistanceKm: row.maxDistanceKm,
  feeMinor: fromDecimalString(row.deliveryFee),
  isActive: row.isActive === 1,
});

const publicShape = (row: ZoneRow) => ({
  id: row.id,
  name: row.name,
  minDistanceKm: row.minDistanceKm,
  maxDistanceKm: row.maxDistanceKm,
  feeMinor: fromDecimalString(row.deliveryFee),
  isActive: row.isActive === 1,
});

async function loadZones(restaurantId: number): Promise<ZoneRow[]> {
  return db
    .select()
    .from(deliveryZones)
    .where(eq(deliveryZones.restaurantId, restaurantId))
    .orderBy(asc(deliveryZones.minDistanceKm));
}

/** Reject a write whose resulting set would contain overlapping bands. */
function assertNoOverlap(resulting: DeliveryZoneRule[]): void {
  const errors = zoneSetErrors(resulting);
  if (errors.length > 0) {
    throw unprocessable(errors[0]!.message, 'ZONE_CONFLICT', {
      issues: errors.map((issue) => ({
        issue: issue.issue,
        message: issue.message,
        zoneIds: issue.zoneIds,
      })),
    });
  }
}

zonesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await loadZones(tenantOf(req));
    ok(res, rows.map(publicShape));
  }),
);

zonesRouter.post(
  '/',
  validateBody(createDeliveryZoneSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const input = req.body as CreateDeliveryZoneInput;

    const existing = (await loadZones(restaurantId)).map(toRule);
    assertNoOverlap([
      ...existing,
      {
        // Id 0 marks the not-yet-saved zone in any reported conflict.
        id: 0,
        name: input.name ?? null,
        minDistanceKm: input.minDistanceKm,
        maxDistanceKm: input.maxDistanceKm,
        feeMinor: Math.round(input.deliveryFee * 100),
        isActive: input.isActive,
      },
    ]);

    const [result] = await db.insert(deliveryZones).values({
      restaurantId,
      name: input.name ?? null,
      minDistanceKm: input.minDistanceKm,
      maxDistanceKm: input.maxDistanceKm,
      deliveryFee: toDecimalString(Math.round(input.deliveryFee * 100)),
      isActive: input.isActive ? 1 : 0,
    });

    void recomputeRanking(restaurantId).catch(() => undefined);
    created(res, { id: result.insertId });
  }),
);

zonesRouter.patch(
  '/:id',
  validateParams(idParam),
  validateBody(updateDeliveryZoneSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { id } = validatedParams<{ id: number }>(res);
    const input = req.body as UpdateDeliveryZoneInput;

    const rows = await loadZones(restaurantId);
    const target = rows.find((row) => row.id === id);
    if (!target) throw notFound('Delivery zone not found.', 'ZONE_NOT_FOUND');

    // Validate the set as it *would* be, so a zone never conflicts with itself.
    const resulting = rows.map((row) =>
      row.id === id
        ? {
            ...toRule(row),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.minDistanceKm !== undefined ? { minDistanceKm: input.minDistanceKm } : {}),
            ...(input.maxDistanceKm !== undefined ? { maxDistanceKm: input.maxDistanceKm } : {}),
            ...(input.deliveryFee !== undefined ? { feeMinor: Math.round(input.deliveryFee * 100) } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          }
        : toRule(row),
    );
    assertNoOverlap(resulting);

    await db
      .update(deliveryZones)
      .set({
        ...(input.name !== undefined ? { name: input.name ?? null } : {}),
        ...(input.minDistanceKm !== undefined ? { minDistanceKm: input.minDistanceKm } : {}),
        ...(input.maxDistanceKm !== undefined ? { maxDistanceKm: input.maxDistanceKm } : {}),
        ...(input.deliveryFee !== undefined
          ? { deliveryFee: toDecimalString(Math.round(input.deliveryFee * 100)) }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive ? 1 : 0 } : {}),
      })
      .where(and(eq(deliveryZones.id, id), eq(deliveryZones.restaurantId, restaurantId)));

    void recomputeRanking(restaurantId).catch(() => undefined);
    ok(res, { id });
  }),
);

/**
 * Replace the whole set atomically — what the zone editor saves.
 *
 * All-or-nothing matters here: a partially applied set could leave a restaurant
 * briefly charging the wrong fee, or with a gap that silently refuses orders.
 */
zonesRouter.put(
  '/',
  validateBody(replaceDeliveryZonesSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { zones } = req.body as ReplaceDeliveryZonesInput;

    assertNoOverlap(
      zones.map((zone, index) => ({
        id: zone.id ?? -(index + 1),
        name: zone.name ?? null,
        minDistanceKm: zone.minDistanceKm,
        maxDistanceKm: zone.maxDistanceKm,
        feeMinor: Math.round(zone.deliveryFee * 100),
        isActive: zone.isActive,
      })),
    );

    await db.transaction(async (tx) => {
      await tx.delete(deliveryZones).where(eq(deliveryZones.restaurantId, restaurantId));
      if (zones.length > 0) {
        await tx.insert(deliveryZones).values(
          zones.map((zone) => ({
            restaurantId,
            name: zone.name ?? null,
            minDistanceKm: zone.minDistanceKm,
            maxDistanceKm: zone.maxDistanceKm,
            deliveryFee: toDecimalString(Math.round(zone.deliveryFee * 100)),
            isActive: zone.isActive ? 1 : 0,
          })),
        );
      }
    });

    void recomputeRanking(restaurantId).catch(() => undefined);
    ok(res, (await loadZones(restaurantId)).map(publicShape));
  }),
);

zonesRouter.delete(
  '/:id',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { id } = validatedParams<{ id: number }>(res);

    const result = await db
      .delete(deliveryZones)
      .where(and(eq(deliveryZones.id, id), eq(deliveryZones.restaurantId, restaurantId)));

    if (result[0].affectedRows === 0) throw notFound('Delivery zone not found.', 'ZONE_NOT_FOUND');
    void recomputeRanking(restaurantId).catch(() => undefined);
    noContent(res);
  }),
);
