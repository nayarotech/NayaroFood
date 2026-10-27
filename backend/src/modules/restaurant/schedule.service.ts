import { and, eq, gte, notInArray, sql } from 'drizzle-orm';
import { OrderStatus, schedulingSlots, type RestaurantSchedule } from '@nayaro/shared';
import { db } from '../../db/client.js';
import { orders, type RestaurantSettingsRow } from '../../db/schema/index.js';

export function scheduleFromSettings(settings: Pick<RestaurantSettingsRow, 'timezone' | 'weeklyHours' | 'holidayClosures' | 'schedulingEnabled' | 'defaultPrepTimeMinutes' | 'maxOrdersPerSlot'>): RestaurantSchedule {
  return { timezone: settings.timezone, weeklyHours: settings.weeklyHours ?? null, holidayClosures: settings.holidayClosures ?? [], schedulingEnabled: settings.schedulingEnabled === 1, defaultPrepTimeMinutes: settings.defaultPrepTimeMinutes, maxOrdersPerSlot: settings.maxOrdersPerSlot };
}

export async function availableSlots(restaurantId: number, schedule: RestaurantSchedule, now = new Date()): Promise<string[]> {
  const slots = schedulingSlots(schedule, now);
  if (!slots.length) return [];
  const counts = await db.select({ at: orders.scheduledFor, count: sql<number>`count(*)` }).from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), gte(orders.scheduledFor, now), notInArray(orders.status, [OrderStatus.CANCELLED, OrderStatus.REJECTED])))
    .groupBy(orders.scheduledFor);
  const full = new Set(counts.filter((row) => Number(row.count) >= schedule.maxOrdersPerSlot).map((row) => row.at!.toISOString()));
  return slots.filter((slot) => !full.has(slot));
}
