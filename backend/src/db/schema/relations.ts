import { relations } from 'drizzle-orm';
import { refreshTokens, users } from './users.js';
import { restaurantUsers } from './restaurants.js';

/**
 * Relations for `users`.
 *
 * They live here rather than in `users.ts` because `restaurant_users` points at
 * both tables: declaring them beside the table would make users.ts and
 * restaurants.ts import each other at module load.
 */
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(restaurantUsers),
  refreshTokens: many(refreshTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));
