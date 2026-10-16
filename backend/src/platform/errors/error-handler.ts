import type { ErrorRequestHandler } from 'express';
import { AppError, ConflictError, ValidationError } from './app-error.js';
import type { Logger } from '../logging/logger.js';

/**
 * One Express error-handling middleware, mounted last (ARCHITECTURE.md §10).
 * Envelope matches the frozen contract's `ErrorResponse` schema
 * (`{success:false, message, errors?}`), not a generic `{error:{...}}`
 * shape — reconciled in D-0026 when module 1.2 shipped the first real
 * endpoints. 500s never leak exception text into the body (D-0026); real
 * detail goes to structured logs only, correlated by `req.id`.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof AppError) {
      if (err.httpStatus >= 500) {
        logger.error({ err, requestId: req.id, code: err.code }, err.message);
      } else {
        logger.warn({ requestId: req.id, code: err.code }, err.message);
      }

      // D-0176 (B13): a 409 may carry structured extras (`current`) — spread first so they can never override `success` / `message`.
      const conflictExtras =
        err instanceof ConflictError &&
        typeof err.details === 'object' &&
        err.details !== null &&
        !Array.isArray(err.details)
          ? (err.details as Record<string, unknown>)
          : {};
      res.status(err.httpStatus).json({
        ...conflictExtras,
        success: false,
        message: err.message,
        ...(err instanceof ValidationError && err.errors ? { errors: err.errors } : {}),
      });
      return;
    }

    logger.error({ err, requestId: req.id }, 'Unhandled error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  };
}
