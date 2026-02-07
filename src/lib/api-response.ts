/**
 * Standardized API Response Types
 * 
 * Provides consistent response format across all endpoints.
 */

import { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// ==================== RESPONSE INTERFACES ====================

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Standard success response
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

/**
 * Standard error response
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, string[]>;
  requestId?: string;
}

/**
 * Union type for all API responses
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ==================== RESPONSE HELPERS ====================

/**
 * Create a success response
 */
export function success<T>(
  c: Context,
  data: T,
  options?: {
    message?: string;
    meta?: PaginationMeta;
    status?: ContentfulStatusCode;
  }
): Response {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(options?.message && { message: options.message }),
    ...(options?.meta && { meta: options.meta }),
  };
  
  return c.json(response, (options?.status ?? 200) as ContentfulStatusCode);
}

/**
 * Create a paginated success response
 */
export function paginated<T>(
  c: Context,
  data: T[],
  pagination: {
    total: number;
    page: number;
    limit: number;
  },
  message?: string
): Response {
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  
  const meta: PaginationMeta = {
    total: pagination.total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages,
    hasNext: pagination.page < totalPages,
    hasPrev: pagination.page > 1,
  };
  
  return success(c, data, { meta, message });
}

/**
 * Create a created response (201)
 */
export function created<T>(
  c: Context,
  data: T,
  message?: string
): Response {
  return success(c, data, { message, status: 201 });
}

/**
 * Create an error response
 * Automatically includes requestId for debugging
 */
export function error(
  c: Context,
  errorMessage: string,
  status: ContentfulStatusCode = 400,
  options?: {
    code?: string;
    details?: Record<string, string[]>;
  }
): Response {
  // Get requestId from context (set by request-id middleware)
  const requestId = c.get('requestId') as string | undefined;
  
  const response: ApiErrorResponse = {
    success: false,
    error: errorMessage,
    ...(options?.code && { code: options.code }),
    ...(options?.details && { details: options.details }),
    ...(requestId && { requestId }),
  };
  
  return c.json(response, status as ContentfulStatusCode);
}

/**
 * Create a not found error response (404)
 */
export function notFound(
  c: Context,
  entity: string = 'Data'
): Response {
  return error(c, `${entity} tidak ditemukan`, 404, { code: 'NOT_FOUND' });
}

/**
 * Create an unauthorized error response (401)
 */
export function unauthorized(
  c: Context,
  message: string = 'Tidak memiliki akses'
): Response {
  return error(c, message, 401, { code: 'UNAUTHORIZED' });
}

/**
 * Create a forbidden error response (403)
 */
export function forbidden(
  c: Context,
  message: string = 'Akses ditolak'
): Response {
  return error(c, message, 403, { code: 'FORBIDDEN' });
}

/**
 * Create a validation error response (400)
 */
export function validationError(
  c: Context,
  message: string,
  details?: Record<string, string[]>
): Response {
  return error(c, message, 400, { code: 'VALIDATION_ERROR', details });
}

/**
 * Create a server error response (500)
 */
export function serverError(
  c: Context,
  message: string = 'Terjadi kesalahan server'
): Response {
  return error(c, message, 500, { code: 'SERVER_ERROR' });
}

// ==================== PAGINATION HELPERS ====================

/**
 * Parse pagination params from query string
 */
export function parsePagination(
  c: Context,
  defaults: { page?: number; limit?: number } = {}
): { page: number; limit: number; skip: number } {
  const page = Math.max(1, parseInt(c.req.query('page') || String(defaults.page ?? 1)));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || String(defaults.limit ?? 20))));
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
}

/**
 * Create pagination meta from count
 */
export function createPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  
  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
