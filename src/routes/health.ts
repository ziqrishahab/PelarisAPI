import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { isRedisAvailable, isRedisConfigured } from '../lib/redis.js';
import { getIO } from '../lib/socket.js';
import logger from '../lib/logger.js';

const health = new Hono();

/**
 * Health check endpoint
 * Returns system status and dependencies
 */
health.get('/', async (c) => {
  const startTime = Date.now();
  const checks: Record<string, { status: string; message?: string; latency?: number; details?: Record<string, unknown> }> = {};

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
    const redisConfigured = isRedisConfigured();
    checks.redis = {
      status: redisConfigured 
        ? (isRedisAvailable() ? 'healthy' : 'degraded')
        : 'not_configured',
      message: !redisConfigured 
        ? 'Using in-memory fallback' 
        : (isRedisAvailable() ? undefined : 'Redis unavailable, using in-memory fallback'),
    };
  } catch (error) {
    checks.redis = {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Redis check failed',
    };
  }

  // Check Socket.io
  const io = getIO();
  if (io) {
    const sockets = await io.fetchSockets();
    checks.websocket = {
      status: 'healthy',
      details: {
        connectedClients: sockets.length,
      },
    };
  } else {
    checks.websocket = {
      status: 'unavailable',
      message: 'Socket.io not initialized',
    };
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  checks.memory = {
    status: 'healthy',
    details: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
    },
  };

  // Overall health status
  const isHealthy = checks.database.status === 'healthy';
  const status = isHealthy ? 'healthy' : 'unhealthy';
  const statusCode = isHealthy ? 200 : 503;

  const response = {
    status,
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
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
