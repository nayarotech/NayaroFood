import { z } from 'zod';
import { idSchema, imageUrlSchema, moneyAmountSchema, searchSchema } from './common.js';

export const menuOptionGroupSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  minSelections: z.number().int().min(0).max(20),
  maxSelections: z.number().int().min(1).max(20),
  options: z.array(z.object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(80),
    priceMinor: z.number().int().min(0).max(99_999_900),
    isAvailable: z.boolean(),
  })).min(1).max(20),
}).refine((group) => group.minSelections <= group.maxSelections && group.maxSelections <= group.options.length, {
  message: 'Selection limits must fit the number of options, and minimum cannot exceed maximum.',
});

export const menuOptionGroupsSchema = z.array(menuOptionGroupSchema).max(10).superRefine((groups, ctx) => {
  const groupIds = groups.map((group) => group.id);
  const optionIds = groups.flatMap((group) => group.options.map((option) => option.id));
  if (new Set(groupIds).size !== groupIds.length || new Set(optionIds).size !== optionIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Group and option IDs must be unique within a dish.' });
  }
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required.').max(80),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const reorderCategoriesSchema = z.object({
  order: z.array(idSchema).min(1).max(200),
});
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

export const createFoodItemSchema = z
  .object({
    optionGroups: menuOptionGroupsSchema.optional(),
    categoryId: idSchema,
    name: z.string().trim().min(1, 'Item name is required.').max(150),
    description: z.string().trim().max(1000).optional(),
    imageUrl: imageUrlSchema.optional(),
    price: moneyAmountSchema,
    /** Optional promotional price; must undercut `price` when present. */
    discountPrice: moneyAmountSchema.optional(),
    prepTimeMinutes: z.coerce.number().int().min(0).max(360).optional(),
    isAvailable: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  })
  .refine((v) => v.discountPrice === undefined || v.discountPrice < v.price, {
    error: 'Discounted price must be lower than the regular price.',
    path: ['discountPrice'],
  });
export type CreateFoodItemInput = z.infer<typeof createFoodItemSchema>;

export const updateFoodItemSchema = z
  .object({
    optionGroups: menuOptionGroupsSchema.optional(),
    categoryId: idSchema.optional(),
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
    price: moneyAmountSchema.optional(),
    discountPrice: moneyAmountSchema.nullable().optional(),
    prepTimeMinutes: z.coerce.number().int().min(0).max(360).nullable().optional(),
    isAvailable: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  })
  .refine(
    (v) =>
      v.discountPrice === undefined || v.discountPrice === null || v.price === undefined
        ? true
        : v.discountPrice < v.price,
    { error: 'Discounted price must be lower than the regular price.', path: ['discountPrice'] },
  );
export type UpdateFoodItemInput = z.infer<typeof updateFoodItemSchema>;

export const menuQuerySchema = z.object({
  categoryId: idSchema.optional(),
  search: searchSchema,
  availableOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(false),
});
export type MenuQueryInput = z.infer<typeof menuQuerySchema>;
