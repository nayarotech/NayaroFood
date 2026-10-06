/**
 * The one error type routes and services throw. Anything else reaching the
 * error handler is treated as an unexpected fault: logged in full, reported to
 * the client as a bare 500 with no internals.
 */

export type ErrorDetails = Record<string, unknown> | undefined;

export class AppError extends Error {
  readonly statusCode: number;
  /** Stable machine-readable code the frontend can branch on. */
  readonly code: string;
  readonly details: ErrorDetails;
  /** False for genuine faults, which must not leak their message to the client. */
  readonly expected: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: ErrorDetails,
    expected = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expected = expected;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: ErrorDetails) =>
  new AppError(400, code, message, details);

export const unauthorized = (message = 'Authentication required.', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);

/** Used for both "wrong role" and "wrong tenant" — the client learns nothing extra. */
export const forbidden = (message = 'You do not have access to this resource.', code = 'FORBIDDEN') =>
  new AppError(403, code, message);

export const notFound = (message = 'Resource not found.', code = 'NOT_FOUND') =>
  new AppError(404, code, message);

export const conflict = (message: string, code = 'CONFLICT', details?: ErrorDetails) =>
  new AppError(409, code, message, details);

export const unprocessable = (message: string, code = 'UNPROCESSABLE', details?: ErrorDetails) =>
  new AppError(422, code, message, details);

export const tooManyRequests = (message = 'Too many requests. Please slow down.', code = 'RATE_LIMITED') =>
  new AppError(429, code, message);

export const internal = (message = 'Something went wrong.', details?: ErrorDetails) =>
  new AppError(500, 'INTERNAL_ERROR', message, details, false);
