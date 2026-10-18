/** Response shapes served by the public API. */

export interface DeliveryZoneRule {
  id: number;
  name: string | null;
  minDistanceKm: number;
  maxDistanceKm: number;
  feeMinor: number;
  isActive: boolean;
}

export type DeliveryQuote =
  | { deliverable: true; distanceKm: number; zone: DeliveryZoneRule; feeMinor: number }
  | {
      deliverable: false;
      distanceKm: number;
      reason: 'NO_ZONES_CONFIGURED' | 'OUTSIDE_ALL_ZONES';
      maxSupportedKm: number | null;
    };

export interface RestaurantSummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  address: string;
  isOpen: boolean;
  acceptsOrders: boolean;
  categories: string[];
  /** Public average only; comments stay private to the restaurant. */
  rating: { average: number; count: number } | null;
  distanceKm: number | null;
  delivery: DeliveryQuote | null;
  deliveryFrom: { minFeeMinor: number; maxSupportedKm: number } | null;
}

export interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceMinor: number;
  discountPriceMinor: number | null;
  effectivePriceMinor: number;
  prepTimeMinutes: number | null;
}

export interface RestaurantDetail extends RestaurantSummary {
  latitude: number | null;
  longitude: number | null;
  phone: string;
  minOrderMinor: number;
  currency: string;
  zones: DeliveryZoneRule[];
  menu: { id: number; name: string; items: MenuItem[] }[];
}
