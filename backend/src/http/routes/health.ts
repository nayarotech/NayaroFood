import { Router } from 'express';
import { pingDatabase } from '../../db/client.js';
import { ok } from '../respond.js';

export const healthRouter: Router = Router();

/** Liveness: the process is up. Deliberately does not touch the database. */
healthRouter.get('/health', (_req, res) => {
  ok(res, { status: 'ok', uptime: Math.round(process.uptime()) });
});

/** Readiness: the process can actually serve traffic, database included. */
healthRouter.get('/health/ready', async (_req, res) => {
  try {
    await pingDatabase();
    ok(res, { status: 'ready', database: 'up' });
  } catch {
    res.status(503).json({
      error: { code: 'NOT_READY', message: 'Database is unreachable.' },
    });
  }
});
