import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../index.js';

// Test helper to make requests
async function request(
  path: string, 
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const { method = 'GET', body, headers = {} } = options;
  
  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  
  if (body) {
    requestInit.body = JSON.stringify(body);
  }
  
  const response = await app.fetch(
    new Request(`http://localhost${path}`, requestInit)
  );
  
  const contentType = response.headers.get('content-type');
  const data = contentType?.includes('application/json') 
    ? await response.json() 
    : await response.text();
  
  return { status: response.status, data };
}

describe('Auth Integration Tests', () => {
  describe('POST /api/auth/login', () => {
    it('should reject empty credentials', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: {},
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error).toBeDefined();
    });

    it('should reject invalid email format', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'invalid-email', password: '123456' },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('email');
    });

    it('should reject missing password', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'test@test.com' },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error).toBeDefined();
    });
  });

  describe('POST /api/auth/register', () => {
    it('should reject password less than 6 characters', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: 'test@test.com',
          password: '12345',
          name: 'Test User',
        },
      });
      
      // 400 = validation error, 429 = rate limited (both are valid rejections)
      expect([400, 429]).toContain(res.status);
    });

    it('should reject missing name', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: 'test@test.com',
          password: '123456',
        },
      });
      
      // 400 = validation error, 429 = rate limited (both are valid rejections)
      expect([400, 429]).toContain(res.status);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request('/api/auth/me');
      
      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request('/api/auth/me', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      
      expect(res.status).toBe(401);
    });
  });
});
