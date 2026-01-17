import { PrismaClient } from '@prisma/client';
import logger from './logger.js';
import config from '../config/index.js';

const prisma = new PrismaClient({
  log: config.env.IS_DEV ? ['query', 'info', 'warn', 'error'] : ['error'],
  // Connection pooling configuration
  datasourceUrl: config.database.url,
  // Configure connection pool
  // @ts-ignore - Prisma doesn't expose these in types but they work
  __internal: {
    engine: {
      connection_limit: 10, // Max connections in pool
      pool_timeout: 10, // Seconds to wait for connection
      statement_cache_size: 500, // Prepared statements cache
    }
  }
});

prisma.$on('error' as never, (e: any) => {
  logger.error('Prisma error:', e);
});

if (config.env.IS_DEV) {
  prisma.$on('query' as never, (e: any) => {
    logger.debug(`Query: ${e.query}`, { duration: e.duration });
  });
}

// Graceful shutdown - close connections on process exit
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  logger.info('Prisma disconnected');
});

export default prisma;
