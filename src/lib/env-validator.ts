import logger from '../lib/logger.js';

/**
 * Environment variable validation schema
 */
interface EnvSchema {
  required: string[];
  optional: Array<{
    key: string;
    defaultValue?: string;
    validator?: (value: string) => boolean;
  }>;
}

const envSchema: EnvSchema = {
  required: [
    'DATABASE_URL',
    'JWT_SECRET',
  ],
  optional: [
    {
      key: 'NODE_ENV',
      defaultValue: 'development',
      validator: (v) => ['development', 'production', 'test'].includes(v),
    },
    {
      key: 'PORT',
      defaultValue: '5100',
      validator: (v) => !isNaN(parseInt(v)) && parseInt(v) > 0 && parseInt(v) < 65536,
    },
    {
      key: 'CORS_ORIGINS',
      validator: (v) => v.split(',').every(origin => origin.trim().length > 0),
    },
    {
      key: 'JWT_EXPIRES_IN',
      defaultValue: '7d',
    },
    {
      key: 'REDIS_URL',
      validator: (v) => v.startsWith('redis://') || v.startsWith('rediss://'),
    },
    {
      key: 'SENTRY_DSN',
      validator: (v) => v.startsWith('https://'),
    },
    {
      key: 'BACKUP_ENABLED',
      validator: (v) => ['true', 'false', '0', '1'].includes(v),
    },
  ],
};

/**
 * Validate environment variables on application startup
 * Throws error if required variables are missing or invalid
 */
export function validateEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const key of envSchema.required) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Check optional variables with validators
  for (const { key, validator, defaultValue } of envSchema.optional) {
    const value = process.env[key];

    if (!value) {
      if (defaultValue) {
        warnings.push(`Using default value for ${key}: ${defaultValue}`);
      }
      continue;
    }

    if (validator && !validator(value)) {
      errors.push(`Invalid value for ${key}: ${value}`);
    }
  }

  // Security checks
  if (process.env.NODE_ENV === 'production') {
    // JWT Secret must be strong in production
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }

    // Production should have Sentry configured
    if (!process.env.SENTRY_DSN) {
      warnings.push('SENTRY_DSN not configured - error tracking disabled');
    }

    // Production should have Redis configured
    if (!process.env.REDIS_URL) {
      warnings.push('REDIS_URL not configured - rate limiting may not persist across restarts');
    }

    // CORS origins should be explicitly set in production
    if (!process.env.CORS_ORIGINS) {
      warnings.push('CORS_ORIGINS not configured - using restrictive defaults');
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    logger.warn('Environment validation warnings:', { warnings });
  }

  // Throw on errors
  if (errors.length > 0) {
    logger.error('Environment validation failed:', { errors });
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  logger.info('Environment variables validated successfully');
}
