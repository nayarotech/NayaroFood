import { env } from '../config/env.js';

export function platformDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00${env.PLATFORM_UTC_OFFSET}`);
}

export const OFFSET_MINUTES = (env.PLATFORM_UTC_OFFSET.startsWith('-') ? -1 : 1) * (Number(env.PLATFORM_UTC_OFFSET.slice(1, 3)) * 60 + Number(env.PLATFORM_UTC_OFFSET.slice(4, 6)));

export function platformDayStart(daysAgo = 0, now = new Date()): Date {
  const shifted = now.getTime() + OFFSET_MINUTES * 60_000;
  return new Date(Math.floor(shifted / 86_400_000) * 86_400_000 - daysAgo * 86_400_000 - OFFSET_MINUTES * 60_000);
}
