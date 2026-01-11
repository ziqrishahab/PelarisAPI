import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

const isDev = process.env.NODE_ENV !== 'production';

const prisma = new PrismaClient({
  log: isDev ? ['query', 'info', 'warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

prisma.$on('error' as never, (e: any) => {
  logger.error('Prisma error:', e);
});

if (isDev) {
  prisma.$on('query' as never, (e: any) => {
    logger.debug(`Query: ${e.query}`, { duration: e.duration });
  });
}

export default prisma;
