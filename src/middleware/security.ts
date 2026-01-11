import type { MiddlewareHandler } from 'hono';

/**
 * Security Headers Middleware
 * Adds comprehensive security headers to all responses
 */
export const securityHeaders = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();

    // Prevent clickjacking attacks
    c.res.headers.set('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    c.res.headers.set('X-Content-Type-Options', 'nosniff');

    // Enable XSS filter (legacy browsers)
    c.res.headers.set('X-XSS-Protection', '1; mode=block');

    // Referrer policy for privacy
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy (formerly Feature-Policy)
    c.res.headers.set('Permissions-Policy', 
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    );

    // Content Security Policy for API
    // More restrictive since this is an API server
    c.res.headers.set('Content-Security-Policy', 
      "default-src 'none'; frame-ancestors 'none'; form-action 'none'"
    );

    // Strict Transport Security (HSTS)
    // Only in production to avoid issues with local development
    if (process.env.NODE_ENV === 'production') {
      c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Cross-Origin policies
    c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    c.res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

    // Cache control for API responses
    // Prevent caching of sensitive data
    if (c.req.path.startsWith('/api/')) {
      c.res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      c.res.headers.set('Pragma', 'no-cache');
      c.res.headers.set('Expires', '0');
    }
  };
};

/**
 * Remove sensitive headers that might leak server information
 */
export const removeServerHeaders = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();
    
    // Remove headers that might expose server info
    c.res.headers.delete('X-Powered-By');
    c.res.headers.delete('Server');
    
    // Set custom powered by
    c.res.headers.set('X-Powered-By', 'Hono');
  };
};

/**
 * Combined security middleware
 * Use this for easy setup of all security features
 */
export const security = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();

    // === ANTI-CLICKJACKING ===
    c.res.headers.set('X-Frame-Options', 'DENY');

    // === MIME TYPE SNIFFING ===
    c.res.headers.set('X-Content-Type-Options', 'nosniff');

    // === XSS PROTECTION ===
    c.res.headers.set('X-XSS-Protection', '1; mode=block');

    // === REFERRER POLICY ===
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // === PERMISSIONS POLICY ===
    c.res.headers.set('Permissions-Policy', 
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    );

    // === CONTENT SECURITY POLICY ===
    c.res.headers.set('Content-Security-Policy', 
      "default-src 'none'; frame-ancestors 'none'; form-action 'none'"
    );

    // === HSTS (Production Only) ===
    if (process.env.NODE_ENV === 'production') {
      c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // === CROSS-ORIGIN POLICIES ===
    c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    c.res.headers.set('Cross-Origin-Resource-Policy', 'cross-origin'); // Allow cross-origin for API

    // === CACHE CONTROL FOR API ===
    if (c.req.path.startsWith('/api/')) {
      c.res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      c.res.headers.set('Pragma', 'no-cache');
      c.res.headers.set('Expires', '0');
    }

    // === CUSTOM SERVER IDENTIFIER ===
    c.res.headers.set('X-Powered-By', 'Hono');
  };
};
