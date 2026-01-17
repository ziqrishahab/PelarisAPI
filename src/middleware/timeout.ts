import { MiddlewareHandler } from 'hono';
import logger from '../lib/logger.js';

/**
 * Request timeout middleware
 * Prevents requests from hanging indefinitely
 * @param timeoutMs - Timeout in milliseconds (default: 30 seconds)
 */
export const timeout = (timeoutMs: number = 30000): MiddlewareHandler => {
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
          },
          408
        );
      }
      throw error;
    }
  };
};
