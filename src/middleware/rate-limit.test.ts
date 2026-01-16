import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { rateLimiter, strictRateLimiter, loginRateLimiter, incrementFailedLogin, resetLoginRateLimit } from './rate-limit';

// Mock redis to use in-memory store
vi.mock('../lib/redis.js', () => ({
  getRedis: () => null,
  isRedisAvailable: () => false,
}));

// Mock utils for IP
vi.mock('../lib/utils.js', () => ({
  getClientIP: () => '127.0.0.1',
}));

describe('Rate Limiter Middleware', () => {
  describe('rateLimiter()', () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
      app.use('*', rateLimiter({ max: 3, windowMs: 60000 }));
      app.get('/test', (c) => c.json({ message: 'ok' }));
    });

    it('should allow requests within limit', async () => {
      const res = await app.request('/test');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
    });

    it('should set rate limit headers', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
      expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should block requests exceeding limit', async () => {
      // Use unique app instance with very low limit
      const testApp = new Hono();
      testApp.use('*', rateLimiter({ 
        max: 2, 
        windowMs: 60000,
        keyGenerator: async () => 'test-key-block' // Unique key for this test
      }));
      testApp.get('/test', (c) => c.json({ message: 'ok' }));

      // First two requests should pass
      await testApp.request('/test');
      await testApp.request('/test');
      
      // Third request should be blocked
      const res = await testApp.request('/test');
      expect(res.status).toBe(429);
      
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.retryAfter).toBeDefined();
    });

    it('should include Retry-After header when blocked', async () => {
      const testApp = new Hono();
      testApp.use('*', rateLimiter({ 
        max: 1, 
        windowMs: 60000,
        keyGenerator: async () => 'test-key-retry' // Unique key for this test
      }));
      testApp.get('/test', (c) => c.json({ message: 'ok' }));

      await testApp.request('/test');
      const res = await testApp.request('/test');
      
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeDefined();
    });
  });

  describe('strictRateLimiter()', () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
      app.use('*', strictRateLimiter({ 
        max: 2,
        keyGenerator: async () => 'strict-test-key'
      }));
      app.get('/sensitive', (c) => c.json({ message: 'ok' }));
    });

    it('should use stricter limits by default', async () => {
      const res = await app.request('/sensitive');
      expect(res.status).toBe(200);
    });

    it('should block after exceeding strict limit', async () => {
      await app.request('/sensitive');
      await app.request('/sensitive');
      
      const res = await app.request('/sensitive');
      expect(res.status).toBe(429);
    });
  });

  describe('loginRateLimiter()', () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
      app.use('*', loginRateLimiter({ 
        max: 3, 
        windowMs: 60000,
        keyGenerator: async () => 'login:test-ip'
      }));
      app.post('/login', (c) => c.json({ message: 'login endpoint' }));
    });

    it('should allow login attempts within limit', async () => {
      const res = await app.request('/login', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('should set rate limit headers', async () => {
      const res = await app.request('/login', { method: 'POST' });
      expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
      expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
    });
  });

  describe('incrementFailedLogin()', () => {
    it('should increment failed login counter', async () => {
      const ip = 'test-increment-ip';
      
      // This should not throw
      await expect(incrementFailedLogin(ip)).resolves.not.toThrow();
    });
  });

  describe('resetLoginRateLimit()', () => {
    it('should reset login rate limit', async () => {
      const ip = 'test-reset-ip';
      
      // First increment
      await incrementFailedLogin(ip);
      
      // Then reset - should not throw
      await expect(resetLoginRateLimit(ip)).resolves.not.toThrow();
    });
  });
});

describe('Rate Limiter with Custom Key Generator', () => {
  it('should use custom key generator', async () => {
    let customKeyUsed = false;
    
    const app = new Hono();
    app.use('*', rateLimiter({
      max: 10,
      keyGenerator: async () => {
        customKeyUsed = true;
        return 'custom-key';
      }
    }));
    app.get('/test', (c) => c.json({ message: 'ok' }));

    await app.request('/test');
    expect(customKeyUsed).toBe(true);
  });
});

describe('Rate Limiter Custom Messages', () => {
  it('should use custom error message', async () => {
    const app = new Hono();
    const customMessage = 'Kamu terlalu banyak request!';
    
    app.use('*', rateLimiter({
      max: 1,
      message: customMessage,
      keyGenerator: async () => 'custom-message-key'
    }));
    app.get('/test', (c) => c.json({ message: 'ok' }));

    await app.request('/test');
    const res = await app.request('/test');
    
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe(customMessage);
  });
});
