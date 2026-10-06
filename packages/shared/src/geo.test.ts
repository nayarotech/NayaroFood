import { describe, expect, it } from 'vitest';
import { GeoError, haversineKm, roundKm } from './geo.js';

// Kathmandu landmarks, used as realistic fixtures.
const THAMEL = { latitude: 27.7154, longitude: 85.3123 };
const PATAN = { latitude: 27.6766, longitude: 85.3250 };

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(THAMEL, THAMEL)).toBe(0);
  });

  it('computes a realistic city distance', () => {
    // Thamel -> Patan Durbar Square is roughly 4.5 km as the crow flies.
    const km = haversineKm(THAMEL, PATAN);
    expect(km).toBeGreaterThan(4);
    expect(km).toBeLessThan(5);
  });

  it('is symmetric', () => {
    expect(haversineKm(THAMEL, PATAN)).toBe(haversineKm(PATAN, THAMEL));
  });

  it('always returns at most 2 decimal places', () => {
    const km = haversineKm(THAMEL, PATAN);
    expect(Number(km.toFixed(2))).toBe(km);
  });

  it('approximates one degree of latitude as ~111 km', () => {
    const km = haversineKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(km).toBeCloseTo(111.19, 1);
  });

  it('handles antipodal points without NaN', () => {
    const km = haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });
    expect(Number.isFinite(km)).toBe(true);
    expect(km).toBeCloseTo(20015.09, 0);
  });

  it('rejects out-of-range coordinates rather than returning a wrong number', () => {
    expect(() => haversineKm({ latitude: 91, longitude: 0 }, THAMEL)).toThrow(GeoError);
    expect(() => haversineKm(THAMEL, { latitude: 0, longitude: 181 })).toThrow(GeoError);
    expect(() => haversineKm(THAMEL, { latitude: Number.NaN, longitude: 0 })).toThrow(GeoError);
  });
});

describe('roundKm', () => {
  it('rounds half up', () => {
    expect(roundKm(7.425)).toBe(7.43);
    expect(roundKm(4.995)).toBe(5);
    expect(roundKm(1.234)).toBe(1.23);
  });

  it('leaves already-rounded values untouched', () => {
    expect(roundKm(7.4)).toBe(7.4);
    expect(roundKm(20)).toBe(20);
  });
});
