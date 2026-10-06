import { Router } from 'express';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  createCategorySchema,
  createFoodItemSchema,
  fromDecimalString,
  idSchema,
  reorderCategoriesSchema,
  slugify,
  toDecimalString,
  updateCategorySchema,
  updateFoodItemSchema,
  type CreateCategoryInput,
  type CreateFoodItemInput,
  type UpdateCategoryInput,
  type UpdateFoodItemInput,
} from '@nayaro/shared';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { categories, foodItems } from '../../db/schema/index.js';
import { requireAuth, requireRestaurant, tenantOf } from '../../http/middleware/auth.js';
import {
  asyncHandler,
  validateBody,
  validateParams,
  validatedParams,
} from '../../http/middleware/validate.js';
import { badRequest, conflict, notFound } from '../../http/errors.js';
import { created, noContent, ok } from '../../http/respond.js';
import { uniqueSlug } from '../../lib/slug.js';
import { recomputeRanking } from '../ranking/ranking.service.js';

/**
 * Menu management, tenant-scoped.
 *
 * Every query below carries `eq(table.restaurantId, tenantOf(req))`. There is
 * no lookup by id alone, so a guessed or leaked id from another restaurant
 * resolves to nothing rather than to someone else's data.
 */
export const menuRouter: Router = Router();

menuRouter.use(requireAuth, requireRestaurant);

const idParam = z.object({ id: idSchema });

/** Menu edits move the completeness score, so the listing must not go stale. */
function refreshRanking(restaurantId: number): void {
  void recomputeRanking(restaurantId).catch(() => undefined);
}

/* ------------------------------ categories ------------------------------ */

menuRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        sortOrder: categories.sortOrder,
        isActive: categories.isActive,
        itemCount: sql<number>`(
          select count(*) from ${foodItems}
          where ${foodItems.categoryId} = ${categories.id}
            and ${foodItems.deletedAt} is null
        )`,
      })
      .from(categories)
      .where(and(eq(categories.restaurantId, restaurantId), isNull(categories.deletedAt)))
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    ok(res, rows.map((row) => ({ ...row, isActive: row.isActive === 1, itemCount: Number(row.itemCount) })));
  }),
);

menuRouter.post(
  '/categories',
  validateBody(createCategorySchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const input = req.body as CreateCategoryInput;

    const slug = await uniqueSlug(input.name, async (candidate) => {
      const [row] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.restaurantId, restaurantId), eq(categories.slug, candidate)))
        .limit(1);
      return Boolean(row);
    }, 'category');

    const [result] = await db.insert(categories).values({
      restaurantId,
      name: input.name,
      slug,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive ? 1 : 0,
    });

    refreshRanking(restaurantId);
    created(res, { id: result.insertId, name: input.name, slug });
  }),
);

menuRouter.patch(
  '/categories/:id',
  validateParams(idParam),
  validateBody(updateCategorySchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { id } = validatedParams<{ id: number }>(res);
    const input = req.body as UpdateCategoryInput;

    const result = await db
      .update(categories)
      .set({
        ...(input.name !== undefined ? { name: input.name, slug: slugify(input.name) } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive ? 1 : 0 } : {}),
      })
      // The tenant predicate is what makes this safe, not the id.
      .where(and(eq(categories.id, id), eq(categories.restaurantId, restaurantId)));

    if (result[0].affectedRows === 0) throw notFound('Category not found.', 'CATEGORY_NOT_FOUND');
    refreshRanking(restaurantId);
    ok(res, { id });
  }),
);

menuRouter.post(
  '/categories/reorder',
  validateBody(reorderCategoriesSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { order } = req.body as { order: number[] };

    await db.transaction(async (tx) => {
      for (const [index, id] of order.entries()) {
        await tx
          .update(categories)
          .set({ sortOrder: index })
          .where(and(eq(categories.id, id), eq(categories.restaurantId, restaurantId)));
      }
    });

    ok(res, { order });
  }),
);

menuRouter.delete(
  '/categories/:id',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { id } = validatedParams<{ id: number }>(res);

    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(foodItems)
      .where(and(eq(foodItems.categoryId, id), eq(foodItems.restaurantId, restaurantId), isNull(foodItems.deletedAt)));

    if (Number(count) > 0) {
      throw conflict(
        `Move or delete the ${count} item${Number(count) === 1 ? '' : 's'} in this category first.`,
        'CATEGORY_NOT_EMPTY',
      );
    }

    // Soft delete: past orders reference this category's items indirectly.
    const result = await db
      .update(categories)
      .set({ deletedAt: new Date() })
      .where(and(eq(categories.id, id), eq(categories.restaurantId, restaurantId), isNull(categories.deletedAt)));

    if (result[0].affectedRows === 0) throw notFound('Category not found.', 'CATEGORY_NOT_FOUND');
    refreshRanking(restaurantId);
    noContent(res);
  }),
);

/* ------------------------------- items ---------------------------------- */

menuRouter.get(
  '/items',
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const rows = await db
      .select({
        id: foodItems.id,
        categoryId: foodItems.categoryId,
        categoryName: categories.name,
        name: foodItems.name,
        description: foodItems.description,
        imageUrl: foodItems.imageUrl,
        price: foodItems.price,
        discountPrice: foodItems.discountPrice,
        prepTimeMinutes: foodItems.prepTimeMinutes,
        isAvailable: foodItems.isAvailable,
        sortOrder: foodItems.sortOrder,
      })
      .from(foodItems)
      .innerJoin(categories, eq(categories.id, foodItems.categoryId))
      .where(and(eq(foodItems.restaurantId, restaurantId), isNull(foodItems.deletedAt)))
      .orderBy(asc(categories.sortOrder), asc(foodItems.sortOrder), asc(foodItems.name));

    ok(
      res,
      rows.map((row) => ({
        ...row,
        priceMinor: fromDecimalString(row.price),
        discountPriceMinor: row.discountPrice ? fromDecimalString(row.discountPrice) : null,
        isAvailable: row.isAvailable === 1,
      })),
    );
  }),
);

/** The category must belong to the same tenant, or items could be cross-filed. */
async function assertCategoryOwned(restaurantId: number, categoryId: number): Promise<void> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.restaurantId, restaurantId), isNull(categories.deletedAt)))
    .limit(1);
  if (!row) throw badRequest('That category does not exist.', 'CATEGORY_NOT_FOUND');
}

menuRouter.post(
  '/items',
  validateBody(createFoodItemSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const input = req.body as CreateFoodItemInput;

    await assertCategoryOwned(restaurantId, input.categoryId);

    const slug = await uniqueSlug(input.name, async (candidate) => {
      const [row] = await db
        .select({ id: foodItems.id })
        .from(foodItems)
        .where(and(eq(foodItems.restaurantId, restaurantId), eq(foodItems.slug, candidate)))
        .limit(1);
      return Boolean(row);
    }, 'item');

    const [result] = await db.insert(foodItems).values({
      restaurantId,
      categoryId: input.categoryId,
      name: input.name,
      slug,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      price: toDecimalString(Math.round(input.price * 100)),
      discountPrice:
        input.discountPrice === undefined ? null : toDecimalString(Math.round(input.discountPrice * 100)),
      prepTimeMinutes: input.prepTimeMinutes ?? null,
      isAvailable: input.isAvailable ? 1 : 0,
      sortOrder: input.sortOrder,
    });

    refreshRanking(restaurantId);
    created(res, { id: result.insertId, name: input.name, slug });
  }),
);

menuRouter.patch(
  '/items/:id',
  validateParams(idParam),
  validateBody(updateFoodItemSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { id } = validatedParams<{ id: number }>(res);
    const input = req.body as UpdateFoodItemInput;

    if (input.categoryId !== undefined) await assertCategoryOwned(restaurantId, input.categoryId);

    const result = await db
      .update(foodItems)
      .set({
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.price !== undefined ? { price: toDecimalString(Math.round(input.price * 100)) } : {}),
        ...(input.discountPrice !== undefined
          ? {
              discountPrice:
                input.discountPrice === null ? null : toDecimalString(Math.round(input.discountPrice * 100)),
            }
          : {}),
        ...(input.prepTimeMinutes !== undefined ? { prepTimeMinutes: input.prepTimeMinutes } : {}),
        ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable ? 1 : 0 } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      })
      .where(and(eq(foodItems.id, id), eq(foodItems.restaurantId, restaurantId), isNull(foodItems.deletedAt)));

    if (result[0].affectedRows === 0) throw notFound('Item not found.', 'ITEM_NOT_FOUND');
    refreshRanking(restaurantId);
    ok(res, { id });
  }),
);

menuRouter.delete(
  '/items/:id',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { id } = validatedParams<{ id: number }>(res);

    // Soft delete keeps `order_items.food_item_id` meaningful for past orders.
    const result = await db
      .update(foodItems)
      .set({ deletedAt: new Date(), isAvailable: 0 })
      .where(and(eq(foodItems.id, id), eq(foodItems.restaurantId, restaurantId), isNull(foodItems.deletedAt)));

    if (result[0].affectedRows === 0) throw notFound('Item not found.', 'ITEM_NOT_FOUND');
    refreshRanking(restaurantId);
    noContent(res);
  }),
);
