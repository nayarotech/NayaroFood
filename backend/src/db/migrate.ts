import { migrate } from 'drizzle-orm/mysql2/migrator';
import { closeDatabase, db } from './client.js';
import { env } from '../config/env.js';

/**
 * Applies any pending migrations from ./drizzle, then exits. Safe to re-run:
 * drizzle tracks what has already been applied in `__drizzle_migrations`.
 */
async function main(): Promise<void> {
  console.log(`Migrating ${env.DB_NAME} at ${env.DB_HOST}:${env.DB_PORT} …`);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
}

main()
  .catch((error: unknown) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
