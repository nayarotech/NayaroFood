import type { MenuOptionGroup } from '@nayaro/shared';
import { relations } from 'drizzle-orm';
import { index, int, json, mysqlTable, text, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { deletedAt, fk, money, pk, timestamps } from './_shared.js';
import { restaurants } from './restaurants.js';

/** Menu sections. Scoped to one restaurant; slugs are unique per tenant, not globally. */
export const categories = mysqlTable(
  'categories',
  {
    id: pk(),
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }),
    sortOrder: int('sort_order').notNull().default(0),
    isActive: int('is_active').notNull().default(1),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('uq_categories_restaurant_slug').on(t.restaurantId, t.slug),
    index('idx_categories_listing').on(t.restaurantId, t.isActive, t.sortOrder),
  ],
);

/**
 * Menu items. The composite index leads with `restaurant_id` so that the
 * tenant predicate is always the first thing MySQL narrows on — a tenant-scoped
 * menu read never touches another restaurant's rows.
 */
export const foodItems = mysqlTable(
  'food_items',
  {
    id: pk(),
    restaurantId: fk('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    // RESTRICT: a category holding items must be emptied before it can go.
    categoryId: fk('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 150 }).notNull(),
    slug: varchar('slug', { length: 170 }).notNull(),
    description: text('description'),
    imageUrl: varchar('image_url', { length: 500 }),
    optionGroups: json('option_groups').$type<MenuOptionGroup[]>(),
    price: money('price').notNull(),
    /** Promotional price. When set and lower than `price`, this is what is charged. */
    discountPrice: money('discount_price'),
    prepTimeMinutes: int('prep_time_minutes'),
    isAvailable: int('is_available').notNull().default(1),
    sortOrder: int('sort_order').notNull().default(0),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('uq_food_items_restaurant_slug').on(t.restaurantId, t.slug),
    index('idx_food_items_menu').on(t.restaurantId, t.categoryId, t.isAvailable),
    index('idx_food_items_availability').on(t.restaurantId, t.isAvailable, t.deletedAt),
    index('idx_food_items_name').on(t.name),
  ],
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [categories.restaurantId],
    references: [restaurants.id],
  }),
  items: many(foodItems),
}));

export const foodItemsRelations = relations(foodItems, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [foodItems.restaurantId],
    references: [restaurants.id],
  }),
  category: one(categories, {
    fields: [foodItems.categoryId],
    references: [categories.id],
  }),
}));

export type CategoryRow = typeof categories.$inferSelect;
export type FoodItemRow = typeof foodItems.$inferSelect;
