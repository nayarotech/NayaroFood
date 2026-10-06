import { bigint, decimal, timestamp } from 'drizzle-orm/mysql-core';

/**
 * Column builders reused across every table, so that ids, money, coordinates
 * and timestamps are physically identical wherever they appear.
 */

/** BIGINT UNSIGNED AUTO_INCREMENT primary key. */
export const pk = () => bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey();

/** A BIGINT UNSIGNED foreign-key column. */
export const fk = (name: string) => bigint(name, { mode: 'number', unsigned: true });

/**
 * Money: DECIMAL(10,2), read back as a string so no value ever passes through
 * a float. Convert with `fromDecimalString` / `toDecimalString`.
 */
export const money = (name: string) => decimal(name, { precision: 10, scale: 2 });

/** Distance in km: DECIMAL(6,2) — up to 9999.99 km, 10 m resolution. */
export const distanceKm = (name: string) =>
  decimal(name, { precision: 6, scale: 2, mode: 'number' });

/** WGS84 coordinate: DECIMAL(10,7) — roughly 1 cm resolution. */
export const coordinate = (name: string) =>
  decimal(name, { precision: 10, scale: 7, mode: 'number' });

export const createdAt = () => timestamp('created_at').defaultNow().notNull();

export const updatedAt = () => timestamp('updated_at').defaultNow().onUpdateNow().notNull();

/** Soft-delete marker. Null means the row is live. */
export const deletedAt = () => timestamp('deleted_at');

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
