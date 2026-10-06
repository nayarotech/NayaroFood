import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closeDatabase, pingDatabase } from './db/client.js';
import { ensureDefaultPages } from './modules/site/site.routes.js';

/**
 * Process entrypoint: verify the database is reachable before accepting
 * traffic, then listen. Shuts down cleanly so in-flight requests finish and
 * the connection pool is released.
 */
async function main(): Promise<void> {
  try {
    await pingDatabase();
    logger.info(`Database ${env.DB_NAME} reachable at ${env.DB_HOST}:${env.DB_PORT}`);
  } catch (error) {
    logger.fatal(
      { err: error },
      `Cannot reach MySQL at ${env.DB_HOST}:${env.DB_PORT}. Is it running, and is backend/.env correct?`,
    );
    process.exit(1);
  }

  // Footer links point at these; make sure they exist on a fresh database.
  await ensureDefaultPages().catch((error: unknown) => logger.error({ err: error }, 'Could not create default pages'));

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
    logger.info(`WhatsApp provider: ${env.WHATSAPP_PROVIDER}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down…`);
    server.close(async () => {
      await closeDatabase();
      logger.info('Shutdown complete.');
      process.exit(0);
    });
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void main();
