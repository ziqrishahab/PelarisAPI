import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '../../logs');

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Format for file output (JSON for easy parsing)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'Pelaris.id-api' },
  transports: [
    // Console output (colorized, human-readable)
    new winston.transports.Console({
      format: consoleFormat,
    }),
    
    // Error log file (errors only)
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    
    // Combined log file (all levels)
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});

// In production, don't log to console (PM2 handles it)
if (process.env.NODE_ENV === 'production') {
  logger.transports[0].silent = true;
}

// Helper functions for common log patterns
export const logRequest = (method: string, path: string, statusCode: number, duration: number, userId?: string) => {
  logger.info('HTTP Request', {
    method,
    path,
    statusCode,
    duration: `${duration}ms`,
    userId: userId || 'anonymous',
  });
};

export const logError = (error: Error | unknown, context?: Record<string, any>) => {
  if (error instanceof Error) {
    logger.error(error.message, {
      stack: error.stack,
      name: error.name,
      ...context,
    });
  } else {
    logger.error('Unknown error', { error, ...context });
  }
};

export const logAuth = (action: string, userId: string, email: string, success: boolean, ip?: string) => {
  logger.info(`Auth: ${action}`, {
    userId,
    email,
    success,
    ip,
  });
};

export const logTransaction = (
  action: string,
  transactionId: string,
  amount: number,
  userId: string,
  cabangId: string
) => {
  logger.info(`Transaction: ${action}`, {
    transactionId,
    amount,
    userId,
    cabangId,
  });
};

export const logStock = (
  action: string,
  variantId: string,
  cabangId: string,
  quantity: number,
  previousQty?: number,
  userId?: string
) => {
  logger.info(`Stock: ${action}`, {
    variantId,
    cabangId,
    quantity,
    previousQty,
    userId,
  });
};

export const logSocket = (event: string, socketId: string, data?: any) => {
  logger.debug(`Socket: ${event}`, {
    socketId,
    data,
  });
};

export default logger;
