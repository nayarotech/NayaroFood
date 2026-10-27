import { describe, expect, it } from 'vitest';
import { platformDate, platformDayStart } from './platform-day.js';

describe('platform reporting days (+05:45)', () => {
  it('changes day at Nepal midnight rather than host midnight', () => {
    expect(platformDayStart(0, new Date('2026-10-25T18:14:59Z')).toISOString()).toBe('2026-10-24T18:15:00.000Z');
    expect(platformDayStart(0, new Date('2026-10-25T18:15:00Z')).toISOString()).toBe('2026-10-25T18:15:00.000Z');
  });
  it('uses the same boundary for date filters and prior-day reports', () => {
    expect(platformDate('2026-10-26').toISOString()).toBe('2026-10-25T18:15:00.000Z');
    expect(platformDayStart(1, new Date('2026-10-26T12:00:00Z')).toISOString()).toBe('2026-10-24T18:15:00.000Z');
  });
});
