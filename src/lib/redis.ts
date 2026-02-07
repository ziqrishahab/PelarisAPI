import { Redis } from 'ioredis';
import logger from './logger.js';

let redis: Redis | null = null;
let isConnected = false;
let reconnectInterval: ReturnType<typeof setInterval> | null = null;

// Reconnect attempt interval (30 seconds)
const RECONNECT_INTERVAL_MS = 30000;

// Initialize Redis connection
export function initRedis(): void {
  // Use process.env directly to avoid circular dependency on startup
  const redisUrl = process.env.REDIS_URL;
  
  // Skip if no Redis URL configured
  if (!redisUrl) {
    logger.info('Redis URL not configured, rate limiter will use in-memory storage');
    return;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries, falling back to in-memory');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000); // Retry delay
      },
      lazyConnect: true, // Don't auto-connect, we'll do it manually
      enableReadyCheck: true,
      reconnectOnError: (err: Error) => {
        // Reconnect on specific errors
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        return targetErrors.some(e => err.message.includes(e));
      },
    });

    redis.on('connect', () => {
      isConnected = true;
      logger.info('Redis connected successfully');
      // Clear reconnect interval when connected
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
    });

    redis.on('error', (err: Error) => {
      isConnected = false;
      logger.error('Redis connection error', { error: err.message });
      // Start periodic reconnect attempts
      startReconnectInterval(redisUrl);
    });

    redis.on('close', () => {
      isConnected = false;
      logger.warn('Redis connection closed');
      // Start periodic reconnect attempts
      startReconnectInterval(redisUrl);
    });

    // Attempt to connect
    redis.connect().catch((err: Error) => {
      logger.error('Failed to connect to Redis', { error: err.message });
      // Start periodic reconnect attempts
      startReconnectInterval(redisUrl);
    });
  } catch (error) {
    logger.error('Redis initialization error', { error });
    redis = null;
  }
}

// Start periodic reconnection attempts
function startReconnectInterval(redisUrl: string): void {
  // Only start if not already running and Redis instance exists
  if (reconnectInterval || !redis) return;
  
  reconnectInterval = setInterval(async () => {
    if (isConnected) {
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
      return;
    }
    
    logger.info('Attempting to reconnect to Redis...');
    try {
      await redis?.connect();
    } catch (err) {
      // Error will be handled by the error event
    }
  }, RECONNECT_INTERVAL_MS);
}

// Get Redis client (null if not connected)
export function getRedis(): Redis | null {
  return isConnected ? redis : null;
}

// Check if Redis is configured (REDIS_URL is set)
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

// Check if Redis is available
export function isRedisAvailable(): boolean {
  return isConnected && redis !== null;
}

// Graceful shutdown
export async function disconnectRedis(): Promise<void> {
  // Clear reconnect interval
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
  }
  
  if (redis) {
    try {
      await redis.quit();
      logger.info('Redis disconnected gracefully');
    } catch (error) {
      logger.error('Error disconnecting Redis', { error });
    }
    redis = null;
    isConnected = false;
  }
}
