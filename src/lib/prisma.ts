import { PrismaClient } from '@prisma/client';
import logger from './logger.js';
import config from '../config/index.js';

const prisma = new PrismaClient({
  log: config.env.IS_DEV ? ['query', 'info', 'warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: config.database.url
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

export default prisma;
