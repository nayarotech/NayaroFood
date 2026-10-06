import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';
import { logger } from '../../config/logger.js';
import { isProduction } from '../../config/env.js';

/** Terminal 404 for any path no router claimed. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: `Cannot ${req.method} ${req.path}` },
  });
};

interface MysqlError extends Error {
  code?: string;
  errno?: number;
  sqlMessage?: string;
}

/**
 * The single place an error becomes a response.
 *
 * Expected errors (`AppError`) carry their message through. Everything else —
 * a driver error, a bug, a thrown string — is logged in full and answered with
 * a generic 500, so internals such as SQL text never reach a client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  void _next;

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Some of the submitted values are invalid.',
        // Field-keyed so a form can highlight the offending inputs directly.
        fields: err.issues.reduce<Record<string, string>>((acc, issue) => {
          const key = issue.path.join('.') || '_';
          acc[key] ??= issue.message;
          return acc;
        }, {}),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    if (!err.expected) {
      logger.error({ err, path: req.path }, 'Unexpected AppError');
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  const mysqlError = err as MysqlError;

  // A unique-constraint violation is a real user-facing conflict, but the SQL
  // text names columns and indexes, so only a generic message goes out.
  if (mysqlError?.code === 'ER_DUP_ENTRY') {
    logger.warn({ err: mysqlError, path: req.path }, 'Duplicate entry');
    res.status(409).json({
      error: { code: 'DUPLICATE_ENTRY', message: 'That record already exists.' },
    });
    return;
  }

  if (mysqlError?.code === 'ER_ROW_IS_REFERENCED_2') {
    res.status(409).json({
      error: {
        code: 'IN_USE',
        message: 'This record is still referenced by other data and cannot be removed.',
      },
    });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
      // Only ever in development, and never in a production build.
      ...(isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    },
  });
};
