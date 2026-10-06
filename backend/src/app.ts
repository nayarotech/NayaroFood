import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { corsOrigins, env, isTest } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './http/middleware/error-handler.js';
import { globalLimiter } from './http/middleware/rate-limit.js';
import { healthRouter } from './http/routes/health.js';
import { publicRouter } from './modules/public/public.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { restaurantRouter } from './modules/restaurant/restaurant.routes.js';
import { menuRouter } from './modules/menu/menu.routes.js';
import { zonesRouter } from './modules/zones/zones.routes.js';
import { publicOrdersRouter, tenantOrdersRouter } from './modules/orders/orders.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { publicSiteRouter } from './modules/site/site.routes.js';

/**
 * Builds the Express application.
 *
 * Kept separate from `server.ts` so tests can mount the app with supertest
 * without binding a port.
 */
export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy in production, so req.ip reflects the real client
  // rather than the proxy — rate limiting depends on this being correct.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server requests send no Origin header.
        // Unlisted origins get no CORS headers, so the browser blocks the
        // response. Throwing here would turn every such request into a 500.
        callback(null, !origin || corsOrigins.includes(origin));
      },
      credentials: true,
    }),
  );

  if (!isTest) {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/v1/health' } }));
  }

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  app.use(cookieParser());

  app.use(globalLimiter);

  // Locally stored uploads. Swapped for a CDN origin when UPLOAD_DRIVER=s3.
  if (env.UPLOAD_DRIVER === 'local') {
    app.use('/uploads', express.static(env.UPLOAD_DIR, { maxAge: '7d', fallthrough: true }));
  }

  app.use('/api/v1', healthRouter);
  app.use('/api/v1/public', publicRouter);
  app.use('/api/v1/auth', authRouter);
  // Platform administration is mounted separately from the tenant surface.
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/restaurant', restaurantRouter);
  app.use('/api/v1/restaurant/menu', menuRouter);
  app.use('/api/v1/restaurant/delivery-zones', zonesRouter);
  app.use('/api/v1/restaurant/orders', tenantOrdersRouter);
  app.use('/api/v1/restaurant/uploads', uploadsRouter);
  app.use('/api/v1/public', publicOrdersRouter);
  app.use('/api/v1/public', publicSiteRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
