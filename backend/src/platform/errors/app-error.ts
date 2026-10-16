/**
 * Single error taxonomy for the whole app (ARCHITECTURE.md §10).
 * Application/domain code throws these, never a bare Error
 * (CONVENTIONS.md "Errors & logging"). `code` is a stable, namespaced
 * string (e.g. "RULE_CONDITION_INVALID") — safe to expose to clients.
 */
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(params: {
    code: string;
    httpStatus: number;
    message: string;
    details?: unknown;
    cause?: unknown;
  }) {
    super(params.message, params.cause !== undefined ? { cause: params.cause } : undefined);
    this.name = 'AppError';
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.details = params.details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super({ code: 'NOT_FOUND', httpStatus: 404, message, details });
  }
}

/**
 * `errors` is a field -> messages map (D-0026's one consistent validation-
 * error shape, replacing Laravel's inconsistent per-endpoint variants).
 */
export class ValidationError extends AppError {
  readonly errors: Record<string, string[]> | undefined;

  constructor(message = 'Validation failed', errors?: Record<string, string[]>) {
    super({ code: 'VALIDATION_ERROR', httpStatus: 422, message, details: errors });
    this.errors = errors;
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super({ code: 'UNAUTHENTICATED', httpStatus: 401, message, details });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super({ code: 'FORBIDDEN', httpStatus: 403, message, details });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super({ code: 'CONFLICT', httpStatus: 409, message, details });
  }
}

export class UpstreamError extends AppError {
  constructor(message = 'Upstream service error', details?: unknown, cause?: unknown) {
    super({ code: 'UPSTREAM_ERROR', httpStatus: 502, message, details, cause });
  }
}
