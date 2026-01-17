import { MiddlewareHandler } from 'hono';
import crypto from 'crypto';

/**
 * Request ID middleware
 * Generates or uses existing request ID for tracking requests through the system
 * Useful for debugging and log correlation
 */
export const requestId = (): MiddlewareHandler => {
  return async (c, next) => {
    // Use existing request ID from header or generate new one
    const reqId = c.req.header('x-request-id') || crypto.randomUUID();
    
    // Store in context for use in handlers
    c.set('requestId', reqId);
    
    // Add to response headers
    c.res.headers.set('x-request-id', reqId);
    
    return await next();
  };
};
