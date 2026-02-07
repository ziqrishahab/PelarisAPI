/**
 * Centralized Configuration
 * All environment variables and app config in one place
 */

// Validate required environment variables
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getBooleanEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value === 'true' || value === '1';
}

function getNumberEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Environment
export const NODE_ENV = getEnv('NODE_ENV', 'development');
export const IS_DEV = NODE_ENV === 'development';
export const IS_PROD = NODE_ENV === 'production';

// Server
export const PORT = getNumberEnv('PORT', 5100);

// Database
export const DATABASE_URL = requireEnv('DATABASE_URL');

// JWT
export const JWT_SECRET = requireEnv('JWT_SECRET');
export const JWT_EXPIRES_IN = getEnv('JWT_EXPIRES_IN', '7d');

// CORS
export const CORS_ORIGINS = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : [];

export const PRODUCTION_DOMAIN = process.env.PRODUCTION_DOMAIN;

// Default origins for development
export const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3100',
  'http://localhost:4000',
  'http://127.0.0.1:3100',
  'http://127.0.0.1:4000',
];

export const ALLOWED_ORIGINS = [
  ...CORS_ORIGINS,
  ...(IS_DEV ? DEFAULT_DEV_ORIGINS : []),
].filter(Boolean);

// Redis (optional)
export const REDIS_URL = process.env.REDIS_URL;
export const IS_REDIS_CONFIGURED = !!REDIS_URL;

// Logging
export const LOG_LEVEL = getEnv('LOG_LEVEL', 'info');

// Sentry (optional)
export const SENTRY_DSN = process.env.SENTRY_DSN;
export const SENTRY_ENABLED = getBooleanEnv('SENTRY_ENABLED', IS_PROD);

// Backup
export const BACKUP_RETENTION_DAYS = getNumberEnv('BACKUP_RETENTION_DAYS', 7);

// Return/Refund
export const RETURN_DEADLINE_DAYS = getNumberEnv('RETURN_DEADLINE_DAYS', 7);

// Rate Limiting
export const RATE_LIMIT_WINDOW_MS = getNumberEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000); // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = getNumberEnv('RATE_LIMIT_MAX_REQUESTS', 100);
export const LOGIN_RATE_LIMIT_MAX = getNumberEnv('LOGIN_RATE_LIMIT_MAX', IS_DEV ? 100 : 10);

// Security
export const BCRYPT_SALT_ROUNDS = getNumberEnv('BCRYPT_SALT_ROUNDS', 12);
export const JWT_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// Pagination
export const DEFAULT_PAGE_SIZE = getNumberEnv('DEFAULT_PAGE_SIZE', 20);
export const MAX_PAGE_SIZE = getNumberEnv('MAX_PAGE_SIZE', 200);

// Timeouts (in milliseconds)
export const DEFAULT_REQUEST_TIMEOUT = getNumberEnv('DEFAULT_REQUEST_TIMEOUT', 30000); // 30 seconds
export const LONG_REQUEST_TIMEOUT = getNumberEnv('LONG_REQUEST_TIMEOUT', 120000); // 2 minutes (for exports)

// Cache TTL (in seconds)
export const CACHE_TTL_SHORT = getNumberEnv('CACHE_TTL_SHORT', 60); // 1 minute
export const CACHE_TTL_MEDIUM = getNumberEnv('CACHE_TTL_MEDIUM', 300); // 5 minutes
export const CACHE_TTL_LONG = getNumberEnv('CACHE_TTL_LONG', 1800); // 30 minutes

// Export config object for easy access
export const config = {
  env: {
    NODE_ENV,
    IS_DEV,
    IS_PROD,
  },
  server: {
    PORT,
  },
  database: {
    url: DATABASE_URL,
  },
  jwt: {
    secret: JWT_SECRET,
    expiresIn: JWT_EXPIRES_IN,
  },
  cors: {
    origins: CORS_ORIGINS,
    allowedOrigins: ALLOWED_ORIGINS,
    productionDomain: PRODUCTION_DOMAIN,
  },
  redis: {
    url: REDIS_URL,
    isConfigured: IS_REDIS_CONFIGURED,
  },
  logging: {
    level: LOG_LEVEL,
  },
  sentry: {
    dsn: SENTRY_DSN,
    enabled: SENTRY_ENABLED,
  },
  backup: {
    retentionDays: BACKUP_RETENTION_DAYS,
  },
  returns: {
    deadlineDays: RETURN_DEADLINE_DAYS,
  },
  rateLimit: {
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    loginMax: LOGIN_RATE_LIMIT_MAX,
  },
  security: {
    bcryptSaltRounds: BCRYPT_SALT_ROUNDS,
    jwtCookieMaxAge: JWT_COOKIE_MAX_AGE,
  },
  pagination: {
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  },
  timeout: {
    default: DEFAULT_REQUEST_TIMEOUT,
    long: LONG_REQUEST_TIMEOUT,
  },
  cache: {
    ttlShort: CACHE_TTL_SHORT,
    ttlMedium: CACHE_TTL_MEDIUM,
    ttlLong: CACHE_TTL_LONG,
  },
} as const;

export default config;
