import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { isRedisAvailable } from '../lib/redis.js';
import logger from '../lib/logger.js';

const health = new Hono();

/**
 * Health check endpoint
 * Returns system status and dependencies
 */
health.get('/', async (c) => {
  const startTime = Date.now();
  const checks: Record<string, { status: string; message?: string; latency?: number }> = {};

  // Check database connection
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status: 'healthy',
      latency: Date.now() - dbStart,
    };
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }

  // Check Redis connection (optional)
  try {
    checks.redis = {
      status: isRedisAvailable() ? 'healthy' : 'unavailable',
      message: isRedisAvailable() ? undefined : 'Redis not configured or unavailable',
    };
  } catch (error) {
    checks.redis = {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Redis check failed',
    };
  }

  // Overall health status
  const isHealthy = checks.database.status === 'healthy';
  const status = isHealthy ? 'healthy' : 'unhealthy';
  const statusCode = isHealthy ? 200 : 503;

  const response = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
    responseTime: Date.now() - startTime,
  };

  if (!isHealthy) {
    logger.error('Health check failed', response);
  }

  return c.json(response, statusCode);
});

/**
 * Readiness check endpoint
 * Returns 200 if app is ready to accept traffic
 */
health.get('/ready', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: 'ready' }, 200);
  } catch (error) {
    return c.json(
      {
        status: 'not ready',
        message: error instanceof Error ? error.message : 'System not ready',
      },
      503
    );
  }
});

/**
 * Liveness check endpoint
 * Returns 200 if app is alive (doesn't check dependencies)
 */
health.get('/live', (c) => {
  return c.json({ status: 'alive' }, 200);
});

export default health;
