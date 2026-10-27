import { describe, expect, it } from 'vitest';
import { isWithinHours, isValidScheduledTime, schedulingSlots, type RestaurantSchedule } from './schedule.js';
import { updateRestaurantSettingsSchema } from './schemas/restaurant.js';
const schedule: RestaurantSchedule = { timezone: 'Asia/Kathmandu', weeklyHours: [{ day: 1, opens: '09:00', closes: '17:00' }], holidayClosures: [], schedulingEnabled: true, defaultPrepTimeMinutes: 30, maxOrdersPerSlot: 1 };
const now = new Date('2026-10-26T02:00:00Z'); // Monday 07:45 in Kathmandu.

describe('restaurant hours and scheduling', () => {
  it('uses restaurant-local hours with half-open boundaries', () => {
    expect(isWithinHours(schedule, new Date('2026-10-26T03:14:59Z'))).toBe(false);
    expect(isWithinHours(schedule, new Date('2026-10-26T03:15:00Z'))).toBe(true);
    expect(isWithinHours(schedule, new Date('2026-10-26T11:15:00Z'))).toBe(false);
    expect(isWithinHours(schedule, new Date('2026-10-27T03:15:00Z'))).toBe(false);
  });
  it('preserves unrestricted hours until configured, with holidays still enforced', () => {
    expect(isWithinHours({ ...schedule, weeklyHours: null }, now)).toBe(true);
    expect(isWithinHours({ ...schedule, weeklyHours: [], holidayClosures: [] }, now)).toBe(false);
    expect(isWithinHours({ ...schedule, weeklyHours: null, holidayClosures: ['2026-10-26'] }, now)).toBe(false);
  });
  it('requires preparation to fit inside opening hours', () => {
    expect(isValidScheduledTime(schedule, new Date('2026-10-26T03:15:00Z'), now)).toBe(false);
    expect(isValidScheduledTime(schedule, new Date('2026-10-26T03:45:00Z'), now)).toBe(true);
    expect(isValidScheduledTime(schedule, new Date('2026-10-26T11:15:00Z'), now)).toBe(false);
    const split = { ...schedule, weeklyHours: [{ day: 1, opens: '09:00', closes: '12:00' }, { day: 1, opens: '12:15', closes: '17:00' }] };
    expect(isValidScheduledTime(split, new Date('2026-10-26T06:45:00Z'), now)).toBe(false); // 12:30, across lunch break.
  });
  it('rejects disabled, past, too-soon, unaligned and distant slots', () => {
    expect(isValidScheduledTime({ ...schedule, schedulingEnabled: false }, new Date('2026-10-26T04:00:00Z'), now)).toBe(false);
    expect(isValidScheduledTime(schedule, now, now)).toBe(false);
    expect(isValidScheduledTime(schedule, new Date('2026-10-26T03:46:00Z'), now)).toBe(false);
    expect(isValidScheduledTime(schedule, new Date('2026-10-26T03:45:01Z'), now)).toBe(false);
    expect(isValidScheduledTime(schedule, new Date('2026-11-02T03:45:00Z'), now)).toBe(false);
  });
  it('generates only eligible slots and skips holiday dates', () => {
    const slots = schedulingSlots(schedule, now);
    expect(slots[0]).toBe('2026-10-26T03:45:00.000Z');
    expect(slots.every((slot) => isValidScheduledTime(schedule, new Date(slot), now))).toBe(true);
    expect(schedulingSlots({ ...schedule, holidayClosures: ['2026-10-26'] }, now)).toHaveLength(0);
  });
  it('handles daylight-saving gaps and repeated hours as distinct UTC instants', () => {
    const dst = { ...schedule, timezone: 'America/New_York', weeklyHours: [{ day: 0, opens: '00:00', closes: '04:00' }], defaultPrepTimeMinutes: 15 };
    const autumn = schedulingSlots(dst, new Date('2026-11-01T03:00:00Z'));
    expect(autumn).toContain('2026-11-01T05:30:00.000Z');
    expect(autumn).toContain('2026-11-01T06:30:00.000Z');
    const springNow = new Date('2026-03-08T04:00:00Z');
    const spring = schedulingSlots(dst, springNow);
    expect(spring).toContain('2026-03-08T07:00:00.000Z');
    expect(spring.every((slot) => isValidScheduledTime(dst, new Date(slot), springNow))).toBe(true);
  });
  it('validates timezone, hours, overlap, closures, and capacity', () => {
    expect(updateRestaurantSettingsSchema.safeParse({ timezone: 'Not/AZone' }).success).toBe(false);
    expect(updateRestaurantSettingsSchema.safeParse({ weeklyHours: [{ day: 1, opens: '22:00', closes: '02:00' }] }).success).toBe(false);
    expect(updateRestaurantSettingsSchema.safeParse({ weeklyHours: [{ day: 1, opens: '09:00', closes: '12:00' }, { day: 1, opens: '11:00', closes: '15:00' }] }).success).toBe(false);
    expect(updateRestaurantSettingsSchema.safeParse({ weeklyHours: [{ day: 1, opens: '09:00', closes: '24:00' }], holidayClosures: ['2026-02-30'] }).success).toBe(false);
    expect(updateRestaurantSettingsSchema.safeParse({ maxOrdersPerSlot: 0 }).success).toBe(false);
    expect(updateRestaurantSettingsSchema.safeParse({ timezone: 'Asia/Kathmandu', weeklyHours: null, holidayClosures: [], maxOrdersPerSlot: 10 }).success).toBe(true);
  });
});
