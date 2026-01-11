import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import 'dotenv/config';

// Import Sentry - must be initialized first
import { initSentry, captureError, addBreadcrumb, setUserContext } from './lib/sentry.js';
initSentry();

// Import logger
import logger, { logError, logSocket } from './lib/logger.js';

// Import and initialize Redis
import { initRedis, disconnectRedis } from './lib/redis.js';
initRedis();

// Import middleware
import { rateLimiter, strictRateLimiter } from './middleware/rate-limit.js';
import { security } from './middleware/security.js';

// Import routes
import auth from './routes/auth.js';
import products from './routes/products.js';
import transactions from './routes/transactions.js';
import cabang from './routes/cabang.js';
import settings from './routes/settings.js';
import sync from './routes/sync.js';
import returns from './routes/returns.js';
import stockTransfers from './routes/stock-transfers.js';
import backup from './routes/backup.js';
import stock from './routes/stock.js';
import channels from './routes/channels.js';

// Import socket helper
import { initSocket } from './lib/socket.js';

// Import backup scheduler
import { startBackupScheduler, stopBackupScheduler } from './lib/backup-scheduler.js';

const app = new Hono();
const PORT = parseInt(process.env.PORT || '5100');

// CORS Configuration
// Parse comma-separated origins from environment variable
const envOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : [];

// Fallback to default origins for development
const defaultOrigins = [
  'http://localhost:3100',
  'http://localhost:4000',
  'http://127.0.0.1:3100',
  'http://127.0.0.1:4000',
];

const allowedOrigins = [
  ...envOrigins,
  ...(process.env.NODE_ENV === 'development' ? defaultOrigins : []),
].filter(Boolean) as string[];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin;
    
    // Allow Vercel preview deployments
    if (origin.endsWith('.vercel.app')) return origin;
    
    // Allow default production domain (ziqrishahab.com)
    if (origin.endsWith('.ziqrishahab.com') || origin === 'https://ziqrishahab.com') {
      return origin;
    }
    
    // Allow additional production domain from environment (if specified)
    const productionDomain = process.env.PRODUCTION_DOMAIN;
    if (productionDomain && productionDomain !== 'ziqrishahab.com') {
      if (origin.endsWith(productionDomain) || origin === `https://${productionDomain}`) {
        return origin;
      }
    }
    
    // Allow configured origins
    if (allowedOrigins.includes(origin)) return origin;
    
    // Log rejected origins in development
    if (process.env.NODE_ENV === 'development') {
      logger.warn(`[CORS] Rejected origin: ${origin}`);
    }
    
    return null;
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Security headers middleware - must be before other middleware
app.use('*', security());

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

// Global Rate Limiter - 100 requests per 15 minutes per IP
// Skipped for health check and root endpoint
app.use('/api/*', rateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
}));

// Root endpoint
app.get('/', (c) => {
  return c.json({ message: 'Pelaris.id API - Omnichannel System (Hono)' });
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'OK', timestamp: new Date() });
});

// API Routes
app.route('/api/auth', auth);
app.route('/api/products', products);
app.route('/api/transactions', transactions);
app.route('/api/cabang', cabang);
app.route('/api/settings', settings);
app.route('/api/sync', sync);
app.route('/api/returns', returns);
app.route('/api/stock-transfers', stockTransfers);
app.route('/api/backup', backup);
app.route('/api/stock', stock);
app.route('/api/channels', channels);

// Error handling
app.onError((err, c) => {
  logError(err, { path: c.req.path, method: c.req.method });
  
  // Send to Sentry with request context
  captureError(err, {
    path: c.req.path,
    method: c.req.method,
    query: c.req.query(),
  });
  
  return c.json({ error: err.message || 'Internal server error' }, 500);
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

// Socket.io connection handler
io.on('connection', (socket) => {
  logSocket('connected', socket.id);
  
  socket.on('disconnect', () => {
    logSocket('disconnected', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
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
