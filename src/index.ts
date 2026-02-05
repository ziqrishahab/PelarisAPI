import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import 'dotenv/config';

// Validate environment variables before anything else
import { validateEnv } from './lib/env-validator.js';
validateEnv();

// Import Sentry - must be initialized first
import { initSentry, captureError, addBreadcrumb, setUserContext } from './lib/sentry.js';
initSentry();

// Import logger
import logger, { logError, logSocket } from './lib/logger.js';

// Import and initialize Redis
import { initRedis, disconnectRedis, isRedisAvailable, isRedisConfigured } from './lib/redis.js';
import prisma from './lib/prisma.js';
initRedis();

// Import middleware
import { rateLimiter, strictRateLimiter } from './middleware/rate-limit.js';
import { security } from './middleware/security.js';
import { timeout } from './middleware/timeout.js';
import { requestId } from './middleware/request-id.js';
import { IS_DEV } from './config/index.js';

// Import routes
import auth from './routes/auth.js';
import products from './routes/products.js';
import categories from './routes/categories.js';
import productsImportExport from './routes/products-import-export.js';
import transactions from './routes/transactions.js';
import cabang from './routes/cabang.js';
import settings from './routes/settings.js';
import sync from './routes/sync.js';
import returns from './routes/returns.js';
import stockTransfers from './routes/stock-transfers.js';
import backup from './routes/backup.js';
import stock from './routes/stock.js';
import channels from './routes/channels.js';
import tenants from './routes/tenants.js';
import health from './routes/health.js';

// Import API documentation
import { docsRouter } from './lib/swagger.js';

// Import socket helper
import { initSocket } from './lib/socket.js';

// Import JWT for socket authentication
import { verifyToken } from './lib/jwt.js';

// Import backup scheduler
import { startBackupScheduler, stopBackupScheduler } from './lib/backup-scheduler.js';

// Import config
import config from './config/index.js';

const app = new Hono();
const PORT = config.server.PORT;
const allowedOrigins = config.cors.allowedOrigins;

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin;
    
  // Allow Vercel preview deployments
  if (origin.endsWith('.vercel.app')) return origin;
  
  // Allow production domain from config
  const productionDomain = config.cors.productionDomain;
  if (productionDomain) {
    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.hostname;
      
      // Exact match for the domain itself
      if (originHost === productionDomain || originHost === `www.${productionDomain}`) {
        return origin;
      }
      
      // Subdomain match: must end with .productionDomain (with dot prefix for safety)
      // This prevents attacks like "profit-example.com" matching "example.com"
      if (originHost.endsWith(`.${productionDomain}`)) {
        return origin;
      }
    } catch {
      // Invalid URL, fall through to rejection
    }
  }
    
    // Allow configured origins
    if (allowedOrigins.includes(origin)) return origin;
    
    // Log rejected origins in development
    if (config.env.IS_DEV) {
      logger.warn(`[CORS] Rejected origin: ${origin}`);
    }
    
    return null;
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Security headers middleware - must be before other middleware
app.use('*', security());

// Request ID tracking middleware
app.use('*', requestId());

// Request timeout middleware (30 seconds)
app.use('*', timeout(30000));

// Request logging middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  
  // Skip logging for health checks and static files
  const path = c.req.path;
  if (path !== '/health' && !path.startsWith('/static')) {
    logger.info('HTTP Request', {
      method: c.req.method,
      path,
      status: c.res.status,
      duration: `${duration}ms`,
    });
  }
});

// Global Rate Limiter 
// Dev mode: Disabled (no limit) for easier testing
// Production: 100 requests per 15 minutes per IP
// Skipped for health check and root endpoint
if (!IS_DEV) {
  app.use('/api/*', rateLimiter({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,
  }));
}

// Root endpoint
app.get('/', (c) => {
  return c.json({ message: 'Pelaris.id API - Omnichannel System (Hono)' });
});

// API Documentation (Swagger UI)
app.route('/api/docs', docsRouter);

// Debug endpoint to test Sentry (development only)
if (IS_DEV) {
  app.get('/api/debug-sentry', (c) => {
    throw new Error('Test Sentry error from backend!');
  });
}

// Health check routes
app.route('/health', health);

// Legacy health check endpoint (kept for backward compatibility)
app.get('/health/full', async (c) => {
  const checks = {
    api: 'ok',
    database: 'unknown' as 'ok' | 'error' | 'unknown',
    redis: 'unknown' as 'ok' | 'error' | 'not_configured' | 'unknown',
    timestamp: new Date(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'error';
    logError(error, { context: 'Health check - database' });
  }

  // Redis is optional - only check if configured
  const redisConfigured = await isRedisConfigured();
  if (redisConfigured) {
    try {
      if (isRedisAvailable()) {
        checks.redis = 'ok';
      } else {
        // Redis is configured but not available - this is an error
        checks.redis = 'error';
      }
    } catch (error) {
      checks.redis = 'error';
      logError(error, { context: 'Health check - redis' });
    }
  } else {
    // Redis is not configured - this is OK, not an error
    checks.redis = 'not_configured';
  }

  // Only fail health check if database is down or Redis is configured but unavailable
  const hasError = checks.database === 'error' || (checks.redis === 'error');
  return c.json(checks, hasError ? 503 : 200);
});

// API Routes (v1)
app.route('/api/v1/auth', auth);
app.route('/api/v1/products', productsImportExport); // Must be before products to avoid /:id catching /template
app.route('/api/v1/products', products);
app.route('/api/v1/categories', categories);
app.route('/api/v1/transactions', transactions);
app.route('/api/v1/cabang', cabang);
app.route('/api/v1/settings', settings);
app.route('/api/v1/sync', sync);
app.route('/api/v1/returns', returns);
app.route('/api/v1/stock-transfers', stockTransfers);
app.route('/api/v1/backup', backup);
app.route('/api/v1/stock', stock);
app.route('/api/v1/channels', channels);
app.route('/api/v1/tenants', tenants);

// Legacy API routes (backward compatibility - will be deprecated)
app.route('/api/auth', auth);
app.route('/api/products', productsImportExport); // Must be before products to avoid /:id catching /template
app.route('/api/products', products);
app.route('/api/categories', categories);
app.route('/api/transactions', transactions);
app.route('/api/cabang', cabang);
app.route('/api/settings', settings);
app.route('/api/sync', sync);
app.route('/api/returns', returns);
app.route('/api/stock-transfers', stockTransfers);
app.route('/api/backup', backup);
app.route('/api/stock', stock);
app.route('/api/channels', channels);
app.route('/api/tenants', tenants);

// Error handling
app.onError(async (err, c) => {
  logError(err, { path: c.req.path, method: c.req.method });
  
  // Send to Sentry with request context
  captureError(err, {
    path: c.req.path,
    method: c.req.method,
    query: c.req.query(),
  });
  
  // Use custom error handling
  const { errorToJson } = await import('./lib/errors.js');
  const errorResponse = errorToJson(err);
  
  // Don't expose internal errors in production
  if (config.env.IS_PROD && errorResponse.statusCode === 500) {
    return c.json({ error: 'Internal server error' }, 500);
  }
  
  return c.json(errorResponse, errorResponse.statusCode as any);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Create HTTP server with Socket.io
const server = createServer(async (req, res) => {
  try {
    // Collect body chunks
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    
    // Let Hono handle the request
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      }
    }
    
    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : body,
    });
    
    const response = await app.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    const responseBody = await response.text();
    res.end(responseBody);
  } catch (error: unknown) {
    // Handle connection errors gracefully
    const errorMessage = error instanceof Error ? error.message : '';
    const errorCode = (error as NodeJS.ErrnoException)?.code;
    
    // Ignore client disconnect errors
    if (errorMessage === 'aborted' || errorCode === 'ECONNRESET') {
      return;
    }
    
    logError(error, { context: 'HTTP Server' });
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
});

// Handle server errors
server.on('error', (error) => {
  logError(error, { context: 'Server startup' });
});

// Handle uncaught errors to prevent crash
process.on('uncaughtException', (error) => {
  logError(error, { context: 'Uncaught Exception' });
  captureError(error, { context: 'Uncaught Exception', fatal: true });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise: String(promise) });
  captureError(reason as Error, { context: 'Unhandled Rejection' });
});

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

// Initialize socket helper
initSocket(io);

// Socket.io Authentication Middleware
io.use((socket, next) => {
  try {
    // Get token from handshake auth or query params (for compatibility)
    const token = socket.handshake.auth?.token 
      || socket.handshake.headers?.authorization?.replace('Bearer ', '')
      || socket.handshake.query?.token as string;
    
    if (!token) {
      logger.warn('[Socket] Connection rejected: No token provided', { socketId: socket.id });
      return next(new Error('Authentication required'));
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
      logger.warn('[Socket] Connection rejected: Invalid token', { socketId: socket.id });
      return next(new Error('Invalid or expired token'));
    }
    
    // Attach user data to socket for later use
    socket.data.user = decoded;
    logger.info('[Socket] User authenticated', { 
      socketId: socket.id, 
      userId: decoded.userId, 
      role: decoded.role 
    });
    
    next();
  } catch (error) {
    logger.error('[Socket] Authentication error', { socketId: socket.id, error });
    next(new Error('Authentication failed'));
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  const user = socket.data.user;
  logSocket('connected', socket.id, { userId: user?.userId, role: user?.role });
  
  // Join user to their tenant room for tenant-specific events
  if (user?.tenantId) {
    socket.join(`tenant:${user.tenantId}`);
  }
  
  // Join user to their cabang room for branch-specific events
  if (user?.cabangId) {
    socket.join(`cabang:${user.cabangId}`);
  }
  
  socket.on('disconnect', () => {
    logSocket('disconnected', socket.id, { userId: user?.userId });
  });
});

// Start server
server.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: config.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
  
  // Start backup scheduler after server is running
  startBackupScheduler();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  stopBackupScheduler();
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  stopBackupScheduler();
  await disconnectRedis();
  process.exit(0);
});

export default app;
