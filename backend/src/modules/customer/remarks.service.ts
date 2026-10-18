import { inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customerRemarks, customers } from '../../db/schema/index.js';

export interface CustomerFlags {
  /** Reports from every restaurant on the platform. */
  reports: number;
  /** Distinct restaurants that reported them — one angry kitchen vs. a pattern. */
  reportingRestaurants: number;
  blocked: boolean;
}

/**
 * Platform-wide reliability flags for a set of customers. Restaurants see the
 * counts (so they can decide whether to accept an order) but never another
 * restaurant's notes.
 */
export async function flagsFor(customerIds: number[]): Promise<Map<number, CustomerFlags>> {
  const result = new Map<number, CustomerFlags>();
  const ids = [...new Set(customerIds)];
  if (ids.length === 0) return result;

  const [counts, blocked] = await Promise.all([
    db
      .select({
        customerId: customerRemarks.customerId,
        reports: sql<number>`count(*)`,
        restaurants: sql<number>`count(distinct ${customerRemarks.restaurantId})`,
      })
      .from(customerRemarks)
      .where(inArray(customerRemarks.customerId, ids))
      .groupBy(customerRemarks.customerId),
    db.select({ id: customers.id, isBlocked: customers.isBlocked }).from(customers).where(inArray(customers.id, ids)),
  ]);

  for (const id of ids) result.set(id, { reports: 0, reportingRestaurants: 0, blocked: false });
  for (const row of counts) {
    result.set(row.customerId, {
      ...result.get(row.customerId)!,
      reports: Number(row.reports),
      reportingRestaurants: Number(row.restaurants),
    });
  }
  for (const row of blocked) result.get(row.id)!.blocked = row.isBlocked === 1;
  return result;
}
