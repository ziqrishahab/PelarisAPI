import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../index.js';
import { generateToken } from '../lib/jwt.js';

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

// Generate test token with specific role
function getTestToken(role: string = 'ADMIN') {
  return generateToken('test-user-id', 'test@test.com', role, 'test-cabang-id');
}

describe('Stock Adjustment Integration Tests', () => {
  describe('POST /api/stock/adjustment', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request('/api/stock/adjustment', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          cabangId: 'test-cabang',
          type: 'add',
          quantity: 10,
        },
      });
      
      expect(res.status).toBe(401);
    });

    it('should reject missing variantId', async () => {
      const token = getTestToken();
      const res = await request('/api/stock/adjustment', {
        method: 'POST',
        body: {
          cabangId: 'test-cabang',
          type: 'add',
          quantity: 10,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error.toLowerCase()).toContain('variant');
    });

    it('should reject missing cabangId', async () => {
      const token = getTestToken();
      const res = await request('/api/stock/adjustment', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          type: 'add',
          quantity: 10,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error.toLowerCase()).toContain('cabang');
    });

    it('should reject invalid type', async () => {
      const token = getTestToken();
      const res = await request('/api/stock/adjustment', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          cabangId: 'test-cabang',
          type: 'invalid',
          quantity: 10,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
    });

    it('should reject zero quantity', async () => {
      const token = getTestToken();
      const res = await request('/api/stock/adjustment', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          cabangId: 'test-cabang',
          type: 'add',
          quantity: 0,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Quantity');
    });

    it('should reject negative quantity', async () => {
      const token = getTestToken();
      const res = await request('/api/stock/adjustment', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          cabangId: 'test-cabang',
          type: 'add',
          quantity: -5,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
    });

    it('should accept valid add adjustment', async () => {
      const token = getTestToken();
      const res = await request('/api/stock/adjustment', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          cabangId: 'test-cabang',
          type: 'add',
          quantity: 50,
          reason: 'restock',
          notes: 'Initial stock',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Validation passed, may fail on DB
      expect([400]).not.toContain(res.status);
    });

    it('should accept valid subtract adjustment', async () => {
      const token = getTestToken();
      const res = await request('/api/stock/adjustment', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          cabangId: 'test-cabang',
          type: 'subtract',
          quantity: 5,
          reason: 'damaged',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([400]).not.toContain(res.status);
    });
  });
});

describe('Stock Transfer Integration Tests', () => {
  describe('POST /api/stock-transfers', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request('/api/stock-transfers', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          fromCabangId: 'cabang-a',
          toCabangId: 'cabang-b',
          quantity: 10,
        },
      });
      
      expect(res.status).toBe(401);
    });

    it('should reject KASIR role', async () => {
      const token = getTestToken('KASIR');
      const res = await request('/api/stock-transfers', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          fromCabangId: 'cabang-a',
          toCabangId: 'cabang-b',
          quantity: 10,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(403);
    });

    it('should reject transfer to same cabang', async () => {
      const token = getTestToken('ADMIN');
      const res = await request('/api/stock-transfers', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          fromCabangId: 'same-cabang',
          toCabangId: 'same-cabang',
          quantity: 10,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('sama');
    });

    it('should reject missing variantId', async () => {
      const token = getTestToken('ADMIN');
      const res = await request('/api/stock-transfers', {
        method: 'POST',
        body: {
          fromCabangId: 'cabang-a',
          toCabangId: 'cabang-b',
          quantity: 10,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
    });

    it('should reject zero quantity', async () => {
      const token = getTestToken('ADMIN');
      const res = await request('/api/stock-transfers', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          fromCabangId: 'cabang-a',
          toCabangId: 'cabang-b',
          quantity: 0,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
    });

    it('should accept valid transfer from ADMIN', async () => {
      const token = getTestToken('ADMIN');
      const res = await request('/api/stock-transfers', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          fromCabangId: 'cabang-a',
          toCabangId: 'cabang-b',
          quantity: 10,
          notes: 'Transfer for event',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([400, 403]).not.toContain(res.status);
    });

    it('should accept valid transfer from MANAGER', async () => {
      const token = getTestToken('MANAGER');
      const res = await request('/api/stock-transfers', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          fromCabangId: 'cabang-a',
          toCabangId: 'cabang-b',
          quantity: 25,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([400, 403]).not.toContain(res.status);
    });

    it('should accept valid transfer from OWNER', async () => {
      const token = getTestToken('OWNER');
      const res = await request('/api/stock-transfers', {
        method: 'POST',
        body: {
          variantId: 'test-variant',
          fromCabangId: 'cabang-a',
          toCabangId: 'cabang-b',
          quantity: 100,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([400, 403]).not.toContain(res.status);
    });
  });
});
