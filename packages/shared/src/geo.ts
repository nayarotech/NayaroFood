/**
 * Geographic distance. The backend is the only authority on distance — the
 * frontend may call `haversineKm` to preview a fee, but every figure is
 * recomputed server-side from stored coordinates before an order is accepted.
 */

export interface LatLng {
  readonly latitude: number;
  readonly longitude: number;
}

/** IUGG mean Earth radius, kilometres. */
export const EARTH_RADIUS_KM = 6371.0088;

export const DISTANCE_DECIMALS = 2;

export class GeoError extends Error {}

export function assertLatLng(point: LatLng, label = 'coordinate'): void {
  const { latitude, longitude } = point;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new GeoError(`Invalid ${label} latitude: ${latitude}`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new GeoError(`Invalid ${label} longitude: ${longitude}`);
  }
}

/**
 * Great-circle distance in kilometres, rounded half-up to 2 decimals.
 *
 * Rounding happens here, once, so that zone matching is deterministic: the
 * same pair of coordinates can never land on different sides of a zone
 * boundary depending on where the comparison was made.
 */
export function haversineKm(from: LatLng, to: LatLng): number {
  assertLatLng(from, 'origin');
  assertLatLng(to, 'destination');

  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(a)));

  return roundKm(EARTH_RADIUS_KM * c);
}

/** Round a kilometre figure half-up to the platform's fixed precision. */
export function roundKm(km: number): number {
  if (!Number.isFinite(km)) throw new GeoError(`Not a finite distance: ${km}`);
  const factor = 10 ** DISTANCE_DECIMALS;
  // Nudge by Number.EPSILON so values such as 7.425 round up rather than being
  // dragged down by binary representation error.
  return Math.round((km + Number.EPSILON) * factor) / factor;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Straight-line (crow-flies) distance is what we charge on today. Swapping in
 * road-network routing later means implementing this interface and injecting a
 * different provider — no pricing code changes.
 */
export interface DistanceProvider {
  readonly name: string;
  distanceKm(from: LatLng, to: LatLng): Promise<number>;
}

export const haversineDistanceProvider: DistanceProvider = {
  name: 'haversine',
  async distanceKm(from, to) {
    return haversineKm(from, to);
  },
};
