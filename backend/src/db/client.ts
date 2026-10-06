import { drizzle } from 'drizzle-orm/mysql2';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

/**
 * Single connection pool for the process. Every query — including those inside
 * transactions — goes through this pool.
 */
export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  waitForConnections: true,
  // Keep DECIMAL as a string so money never round-trips through a float.
  decimalNumbers: false,
  // Read DATETIME/TIMESTAMP values as UTC. This only governs how the driver
  // parses them — see the `connection` handler below, which makes the server
  // agree.
  timezone: 'Z',
  charset: 'utf8mb4_unicode_ci',
  enableKeepAlive: true,
  multipleStatements: false,
});

/**
 * Force every pooled connection to UTC.
 *
 * Without this, MySQL evaluates CURRENT_TIMESTAMP defaults in the server's
 * local timezone while the driver parses them back as UTC, so DB-generated
 * timestamps (created_at, placed_at) end up offset from JS-supplied ones
 * (expires_at, revoked_at) by the machine's UTC offset. Any comparison between
 * the two — OTP cooldowns, token expiry, "orders today" — is then wrong by
 * that offset.
 */
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export const db: MySql2Database<typeof schema> = drizzle(pool, {
  schema,
  mode: 'default',
  logger: env.LOG_LEVEL === 'debug',
});

export type Database = typeof db;

/**
 * A transaction handle. Service functions accept `Database | Transaction` so
 * they compose inside a larger transaction without opening a nested one.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type Executor = Database | Transaction;

export async function pingDatabase(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
