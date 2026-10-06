import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Parse and REPLACE a request part with the schema's output.
 *
 * Replacing rather than merging is the point: anything the schema does not
 * declare is dropped before a handler ever sees it. A client cannot smuggle
 * `restaurantId`, `price` or `role` into a payload by adding extra fields.
 */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}

/** Validated query lands on `res.locals.query`, since req.query is read-only in Express 5. */
export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    res.locals.query = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(result.error);
    res.locals.params = result.data;
    next();
  };
}

/** Typed accessors for what the validators stored. */
export const validatedQuery = <T>(res: Response): T => res.locals.query as T;
export const validatedParams = <T>(res: Response): T => res.locals.params as T;

/**
 * Wrap an async handler so a rejected promise reaches the error middleware.
 * Express 5 forwards rejections itself, but being explicit keeps the intent
 * obvious and survives a downgrade.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
