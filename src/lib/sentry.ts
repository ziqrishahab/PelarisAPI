import * as Sentry from '@sentry/node';
import logger from './logger.js';

const SENTRY_DSN = process.env.SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    logger.warn('[Sentry] SENTRY_DSN not configured, error monitoring disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || '1.0.0',
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Only send errors in production, or if explicitly enabled
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true',
    
    // Filter out noisy errors
    beforeSend(event, hint) {
      const error = hint.originalException;
      
      // Ignore client disconnect errors
      if (error instanceof Error) {
        if (error.message === 'aborted' || 
            error.message.includes('ECONNRESET') ||
            error.message.includes('socket hang up')) {
          return null;
        }
      }
      
      return event;
    },
    
    // Add custom tags
    initialScope: {
      tags: {
        service: 'Pelaris.id-api',
      },
    },
  });

  logger.info('[Sentry] Error monitoring initialized');
}

// Capture error with context
export function captureError(error: Error | unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage(String(error), 'error');
    }
  });
}

// Set user context for better error tracking
export function setUserContext(user: { id: string; email: string; role?: string }) {
  if (!SENTRY_DSN) return;
  
  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
}

// Clear user context on logout
export function clearUserContext() {
  if (!SENTRY_DSN) return;
  Sentry.setUser(null);
}

// Add breadcrumb for tracking user actions
export function addBreadcrumb(
  category: string, 
  message: string, 
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = 'info'
) {
  if (!SENTRY_DSN) return;
  
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level,
    timestamp: Date.now() / 1000,
  });
}

// Transaction tracking for performance monitoring
export function startTransaction(name: string, op: string) {
  if (!SENTRY_DSN) return null;
  
  return Sentry.startInactiveSpan({
    name,
    op,
  });
}

export { Sentry };
