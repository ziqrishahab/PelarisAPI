import { MiddlewareHandler } from 'hono';
import logger from '../lib/logger.js';
import config from '../config/index.js';

/**
 * Request timeout middleware
 * Prevents requests from hanging indefinitely
 * @param timeoutMs - Timeout in milliseconds (default: 30 seconds)
 */
export const timeout = (timeoutMs: number = config.timeout.default): MiddlewareHandler => {
  return async (c, next) => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([next(), timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message === 'Request timeout') {
        logger.warn('Request timeout', {
          path: c.req.path,
          method: c.req.method,
          timeout: timeoutMs,
        });
        return c.json(
          {
            error: 'Request timeout',
            message: 'Permintaan memakan waktu terlalu lama',
            code: 'REQUEST_TIMEOUT',
          },
          408
        );
      }
      throw error;
    }
  };
};

/**
 * Long timeout middleware for export/import operations
 * Default: 2 minutes (configurable via LONG_REQUEST_TIMEOUT env)
 */
export const longTimeout = (): MiddlewareHandler => {
  return timeout(config.timeout.long);
};

/**
 * Custom timeout middleware factory
 * Use for specific routes that need different timeouts
 * 
 * Example usage:
 * router.post('/export', customTimeout(120000), handler)
 */
export const customTimeout = (ms: number): MiddlewareHandler => {
  return timeout(ms);
};
