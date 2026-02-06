/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Hono } from 'hono';
import { security, securityHeaders, removeServerHeaders } from './security';

describe('Security Middleware', () => {
  describe('security()', () => {
    let app: Hono;

    beforeAll(() => {
      app = new Hono();
      app.use('*', security());
      app.get('/api/test', (c) => c.json({ message: 'ok' }));
      app.get('/public/test', (c) => c.json({ message: 'ok' }));
    });

    it('should set X-Frame-Options header', async () => {
      const res = await app.request('/api/test');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should set X-Content-Type-Options header', async () => {
      const res = await app.request('/api/test');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should set X-XSS-Protection header', async () => {
      const res = await app.request('/api/test');
      expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should set Referrer-Policy header', async () => {
      const res = await app.request('/api/test');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('should set Permissions-Policy header', async () => {
      const res = await app.request('/api/test');
      const permissionsPolicy = res.headers.get('Permissions-Policy');
      expect(permissionsPolicy).toContain('camera=()');
      expect(permissionsPolicy).toContain('microphone=()');
    });

    it('should set Content-Security-Policy header', async () => {
      const res = await app.request('/api/test');
      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should set Cross-Origin-Opener-Policy header', async () => {
      const res = await app.request('/api/test');
      expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    });

    it('should set Cross-Origin-Resource-Policy header', async () => {
      const res = await app.request('/api/test');
      expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    });

    it('should set X-Powered-By to Hono', async () => {
      const res = await app.request('/api/test');
      expect(res.headers.get('X-Powered-By')).toBe('Hono');
    });

    it('should set Cache-Control for API routes', async () => {
      const res = await app.request('/api/test');
      expect(res.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
      expect(res.headers.get('Pragma')).toBe('no-cache');
      expect(res.headers.get('Expires')).toBe('0');
    });

    it('should NOT set Cache-Control for non-API routes', async () => {
      const res = await app.request('/public/test');
      // Cache-Control should not be set to no-store for non-API routes
      expect(res.headers.get('Cache-Control')).not.toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
    });
  });

  describe('securityHeaders()', () => {
    let app: Hono;

    beforeAll(() => {
      app = new Hono();
      app.use('*', securityHeaders());
      app.get('/test', (c) => c.json({ message: 'ok' }));
    });

    it('should set basic security headers', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });

  describe('removeServerHeaders()', () => {
    let app: Hono;

    beforeAll(() => {
      app = new Hono();
      app.use('*', removeServerHeaders());
      app.get('/test', (c) => c.json({ message: 'ok' }));
    });

    it('should set X-Powered-By to Hono', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('X-Powered-By')).toBe('Hono');
    });
  });

  describe('HSTS in production', () => {
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it('should set HSTS header in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const app = new Hono();
      app.use('*', security());
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const res = await app.request('/test');
      expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload');
    });

    it('should NOT set HSTS header in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const app = new Hono();
      app.use('*', security());
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const res = await app.request('/test');
      expect(res.headers.get('Strict-Transport-Security')).toBeNull();
    });
  });
});
