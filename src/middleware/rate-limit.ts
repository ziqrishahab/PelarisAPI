import { Context, Next } from 'hono';
import { getRedis, isRedisAvailable } from '../lib/redis.js';
import logger from '../lib/logger.js';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

interface RateLimitOptions {
  windowMs?: number;      // Time window in milliseconds
  max?: number;           // Max requests per window
  message?: string;       // Error message
  keyGenerator?: (c: Context) => string | Promise<string>;  // Custom key generator
}

// In-memory store (fallback when Redis is not available)
const memoryStore: RateLimitStore = {};

// Store interval reference for graceful shutdown
let rateLimitCleanupInterval: ReturnType<typeof setInterval> | null = null;

// Clean up expired entries every 5 minutes (only for in-memory)
rateLimitCleanupInterval = setInterval(() => {
  if (!isRedisAvailable()) {
    const now = Date.now();
    for (const key in memoryStore) {
      if (memoryStore[key].resetTime < now) {
        delete memoryStore[key];
      }
    }
  }
}, 5 * 60 * 1000);

/**
 * Stop the rate limit cleanup interval (for graceful shutdown)
 */
export function stopRateLimitCleanup(): void {
  if (rateLimitCleanupInterval) {
    clearInterval(rateLimitCleanupInterval);
    rateLimitCleanupInterval = null;
    logger.info('Rate limit cleanup interval stopped');
  }
}

/**
 * Get rate limit data from Redis or memory
 */
async function getRateLimitData(
  key: string,
  windowMs: number
): Promise<{ count: number; resetTime: number }> {
  const redis = getRedis();
  const now = Date.now();

  if (redis) {
    // Use Redis
    try {
      const redisKey = `ratelimit:${key}`;
      const count = await redis.get(redisKey);
      const ttl = await redis.ttl(redisKey);

      if (count === null || ttl < 0) {
        // Key doesn't exist or expired
        return { count: 0, resetTime: now + windowMs };
      }

      return {
        count: parseInt(count, 10),
        resetTime: now + (ttl * 1000),
      };
    } catch (error) {
      logger.error('Redis get error, falling back to memory', { error });
      // Fallback to memory on error
    }
  }

  // Use in-memory store
  if (!memoryStore[key] || memoryStore[key].resetTime < now) {
    memoryStore[key] = {
      count: 0,
      resetTime: now + windowMs,
    };
  }

  return memoryStore[key];
}

/**
 * Increment rate limit counter
 */
async function incrementRateLimit(
  key: string,
  windowMs: number
): Promise<void> {
  const redis = getRedis();

  if (redis) {
    // Use Redis
    try {
      const redisKey = `ratelimit:${key}`;
      const multi = redis.multi();
      multi.incr(redisKey);
      multi.expire(redisKey, Math.ceil(windowMs / 1000));
      await multi.exec();
      return;
    } catch (error) {
      logger.error('Redis increment error, falling back to memory', { error });
      // Fallback to memory on error
    }
  }

  // Use in-memory store
  if (memoryStore[key]) {
    memoryStore[key].count++;
  }
}

/**
 * Rate Limiter Middleware for Hono
 * 
 * Automatically uses Redis if available, falls back to in-memory
 * Default: 100 requests per 5 minutes per IP
 */
export function rateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = 5 * 60 * 1000,   // 5 minutes (faster reset)
    max = 100,                   // 100 requests per window
    message = 'Too many requests, please try again later.',
    keyGenerator = async (c: Context) => {
      // Get IP from various headers (for proxied requests)
      const { getClientIP } = await import('../lib/utils.js');
      return getClientIP(c);
    }
  } = options;

  return async (c: Context, next: Next): Promise<Response | void> => {
    const key = await keyGenerator(c);
    const now = Date.now();

    // Get current rate limit data
    const data = await getRateLimitData(key, windowMs);

    // Increment counter
    await incrementRateLimit(key, windowMs);

    // Calculate headers
    const remaining = Math.max(0, max - (data.count + 1));
    const resetTime = Math.ceil(data.resetTime / 1000);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetTime));

    // Check if limit exceeded
    if (data.count >= max) {
      c.header('Retry-After', String(Math.ceil((data.resetTime - now) / 1000)));
      return c.json({ 
        error: message,
        retryAfter: Math.ceil((data.resetTime - now) / 1000)
      }, 429);
    }

    await next();
  };
}

/**
 * Stricter rate limiter for sensitive endpoints (login, register, etc.)
 * Default: 5 requests per 5 minutes per IP
 */
export function strictRateLimiter(options: RateLimitOptions = {}) {
  return rateLimiter({
    windowMs: 5 * 60 * 1000,   // 5 minutes (faster reset)
    max: 5,                     // Only 5 attempts
    message: 'Terlalu banyak percobaan, tunggu 5 menit lagi.',
    ...options
  });
}

/**
 * Login rate limiter that only counts failed attempts
 * Successful logins do NOT count against the limit
 * This middleware must be applied BEFORE the route handler
 * Call resetLoginRateLimit() after successful login
 */
export function loginRateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = 15 * 60 * 1000,  // 15 minutes
    max = 10,                    // 10 failed attempts
    keyGenerator = async (c: Context) => {
      const { getClientIP } = await import('../lib/utils.js');
      return `login:${getClientIP(c)}`;
    }
  } = options;

  return async (c: Context, next: Next): Promise<Response | void> => {
    const key = await keyGenerator(c);
    const now = Date.now();

    // Get current rate limit data for failed logins
    const data = await getRateLimitData(key, windowMs);

    // Check if limit exceeded (before trying login)
    if (data.count >= max) {
      const retryAfter = Math.ceil((data.resetTime - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ 
        error: `Terlalu banyak percobaan login gagal. Tunggu ${Math.ceil(retryAfter / 60)} menit lagi.`,
        retryAfter
      }, 429);
    }

    // Set headers
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - data.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(data.resetTime / 1000)));

    await next();
  };
}

/**
 * Increment failed login counter
 * Call this ONLY when login fails (wrong password/email)
 */
export async function incrementFailedLogin(ip: string): Promise<void> {
  const key = `login:${ip}`;
  const windowMs = 15 * 60 * 1000; // 15 minutes
  await incrementRateLimit(key, windowMs);
}

/**
 * Reset login rate limit after successful login
 * Call this after successful authentication
 */
export async function resetLoginRateLimit(ip: string): Promise<void> {
  const key = `login:${ip}`;
  const redis = getRedis();
  
  if (redis) {
    await redis.del(key).catch((err: Error) => {
      logger.warn('Failed to reset login rate limit in Redis:', err);
    });
  } else {
    delete memoryStore[key];
  }
}

/**
 * Rate limiter for API endpoints (more lenient)
 * Default: 200 requests per minute per IP
 */
export function apiRateLimiter(options: RateLimitOptions = {}) {
  return rateLimiter({
    windowMs: 60 * 1000,       // 1 minute
    max: 200,                  // 200 requests per minute
    message: 'API rate limit exceeded. Please slow down.',
    ...options
  });
}
