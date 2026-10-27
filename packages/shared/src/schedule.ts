/** Local calendar hours; intervals stay within a day (use 24:00 for midnight). */
export interface OpeningPeriod { day: number; opens: string; closes: string }
export interface RestaurantSchedule {
  timezone: string;
  weeklyHours: OpeningPeriod[] | null;
  holidayClosures: string[];
  schedulingEnabled: boolean;
  defaultPrepTimeMinutes: number;
  maxOrdersPerSlot: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function localParts(at: Date, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    formatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, day: new Date(`${date}T12:00:00Z`).getUTCDay(), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
export const clockMinutes = (clock: string): number => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

export function isWithinHours(schedule: Pick<RestaurantSchedule, 'timezone' | 'weeklyHours' | 'holidayClosures'>, at: Date): boolean {
  const local = localParts(at, schedule.timezone);
  if (schedule.holidayClosures.includes(local.date)) return false;
  return schedule.weeklyHours === null || schedule.weeklyHours.some((p) => p.day === local.day && local.minute >= clockMinutes(p.opens) && local.minute < clockMinutes(p.closes));
}

/** Both preparation and dispatch must fit in one uninterrupted opening period. */
export function isValidScheduledTime(schedule: RestaurantSchedule, at: Date, now = new Date()): boolean {
  const leadMinutes = Math.max(15, schedule.defaultPrepTimeMinutes);
  const start = new Date(at.getTime() - schedule.defaultPrepTimeMinutes * 60_000);
  if (!schedule.schedulingEnabled || !Number.isFinite(at.getTime()) || at.getTime() < now.getTime() + leadMinutes * 60_000 || at.getTime() > now.getTime() + 7 * 86_400_000 || at.getUTCSeconds() !== 0 || at.getUTCMilliseconds() !== 0) return false;
  const endLocal = localParts(at, schedule.timezone);
  if (endLocal.minute % 15 !== 0) return false;
  // Walk absolute minutes so DST gaps and repeated hours need no wall-clock conversion.
  for (let t = start.getTime(); t <= at.getTime(); t += 60_000) {
    if (!isWithinHours(schedule, new Date(t))) return false;
  }
  return true;
}

export function schedulingSlots(schedule: RestaurantSchedule, now = new Date()): string[] {
  if (!schedule.schedulingEnabled) return [];
  const result: string[] = [];
  const first = Math.ceil((now.getTime() + Math.max(15, schedule.defaultPrepTimeMinutes) * 60_000) / 60_000) * 60_000;
  let openMinutes = 0;
  for (let t = first - schedule.defaultPrepTimeMinutes * 60_000; t <= now.getTime() + 7 * 86_400_000; t += 60_000) {
    const at = new Date(t);
    openMinutes = isWithinHours(schedule, at) ? openMinutes + 1 : 0;
    if (t >= first && openMinutes >= schedule.defaultPrepTimeMinutes + 1 && localParts(at, schedule.timezone).minute % 15 === 0) result.push(at.toISOString());
  }
  return result;
}
