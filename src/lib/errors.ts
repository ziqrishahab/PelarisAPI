/**
 * Custom Error Classes
 * Specific error types for better error handling
 */

/**
 * Base application error
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource} with id ${id} not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', { resource, id });
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * External service error (502)
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: Record<string, unknown>) {
    super(`External service error: ${service} - ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', {
      service,
      ...details,
    });
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT_ERROR', { retryAfter });
  }
}

/**
 * Convert error to JSON response format
 */
export function errorToJson(error: unknown): {
  error: string;
  code?: string;
  statusCode: number;
  details?: Record<string, unknown>;
} {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      statusCode: 500,
    };
  }

  return {
    error: 'An unexpected error occurred',
    statusCode: 500,
  };
}
