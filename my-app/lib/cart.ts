'use client';

import { useSyncExternalStore } from 'react';

/**
 * The customer's cart, kept in this browser only — ordering needs no account.
 *
 * One cart per restaurant, because an order goes to exactly one kitchen.
 * Prices here are for display; the API re-reads every price from the menu
 * when the order is placed, so a stale or edited cart cannot under-charge.
 */

export interface CartLine {
  id: number;
  name: string;
  priceMinor: number;
  quantity: number;
}

const MAX_QTY = 99;
const key = (restaurantId: number) => `nayaro.cart.${restaurantId}`;
const EVENT = 'nayaro:cart';
const EMPTY: CartLine[] = [];

/** useSyncExternalStore needs a stable snapshot per raw value. */
const cache = new Map<string, { raw: string | null; lines: CartLine[] }>();

function read(restaurantId: number): CartLine[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key(restaurantId));
  } catch {
    return EMPTY;
  }
  const cached = cache.get(key(restaurantId));
  if (cached && cached.raw === raw) return cached.lines;
  let lines: CartLine[] = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    lines = Array.isArray(parsed)
      ? parsed.filter((l) => Number.isInteger(l.id) && l.quantity > 0).map((l) => ({ ...l, quantity: Math.min(MAX_QTY, l.quantity) }))
      : EMPTY;
  } catch {
    lines = EMPTY;
  }
  cache.set(key(restaurantId), { raw, lines });
  return lines;
}

function write(restaurantId: number, lines: CartLine[]): void {
  try {
    if (lines.length === 0) window.localStorage.removeItem(key(restaurantId));
    else window.localStorage.setItem(key(restaurantId), JSON.stringify(lines));
  } catch {
    // Storage blocked (private mode): the cart just won't survive a reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange); // other tabs
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useCart(restaurantId: number) {
  const lines = useSyncExternalStore(subscribe, () => read(restaurantId), () => EMPTY);

  const setQuantity = (item: Omit<CartLine, 'quantity'>, quantity: number) => {
    const current = read(restaurantId);
    const next = current.filter((l) => l.id !== item.id);
    if (quantity > 0) {
      const existingIndex = current.findIndex((l) => l.id === item.id);
      const line = { ...item, quantity: Math.min(MAX_QTY, quantity) };
      if (existingIndex >= 0) next.splice(existingIndex, 0, line);
      else next.push(line);
    }
    write(restaurantId, next);
  };

  return {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalMinor: lines.reduce((n, l) => n + l.priceMinor * l.quantity, 0),
    quantityOf: (id: number) => lines.find((l) => l.id === id)?.quantity ?? 0,
    setQuantity,
    clear: () => write(restaurantId, []),
  };
}

/* ---------------- remembered details and recent orders ---------------- */

export interface SavedCustomer {
  name: string;
  phone: string;
  address: string;
  landmark: string;
}

export interface RecentOrder {
  trackingCode: string;
  orderNumber: string;
  restaurantName: string;
  totalMinor: number;
  placedAt: string;
}

const CUSTOMER_KEY = 'nayaro.customer';
const ORDERS_KEY = 'nayaro.orders';

function readJson<T>(storageKey: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storageKey: string, value: unknown): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Not fatal.
  }
}

export const loadCustomer = () => readJson<SavedCustomer | null>(CUSTOMER_KEY, null);
export const saveCustomer = (customer: SavedCustomer) => writeJson(CUSTOMER_KEY, customer);

export const loadRecentOrders = () => readJson<RecentOrder[]>(ORDERS_KEY, []);
export function rememberOrder(order: RecentOrder): void {
  const others = loadRecentOrders().filter((o) => o.trackingCode !== order.trackingCode);
  writeJson(ORDERS_KEY, [order, ...others].slice(0, 20));
}
