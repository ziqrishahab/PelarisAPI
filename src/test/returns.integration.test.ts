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

// Generate test token
function getTestToken(role: string = 'ADMIN') {
  return generateToken('test-user-id', 'test@test.com', role, 'test-cabang-id');
}

describe('Returns Integration Tests', () => {
  describe('POST /api/returns', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request('/api/returns', {
        method: 'POST',
        body: {
          transactionId: 'test-transaction',
          reason: 'DAMAGED',
          items: [{ productVariantId: 'test', quantity: 1, price: 10000 }],
        },
      });
      
      expect(res.status).toBe(401);
    });

    it('should reject missing transactionId', async () => {
      const token = getTestToken();
      const res = await request('/api/returns', {
        method: 'POST',
        body: {
          reason: 'DAMAGED',
          items: [{ productVariantId: 'test', quantity: 1, price: 10000 }],
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error.toLowerCase()).toContain('transaction');
    });

    it('should reject invalid reason', async () => {
      const token = getTestToken();
      const res = await request('/api/returns', {
        method: 'POST',
        body: {
          transactionId: 'test-transaction',
          reason: 'INVALID_REASON',
          items: [{ productVariantId: 'test', quantity: 1, price: 10000 }],
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
    });

    it('should reject empty items array', async () => {
      const token = getTestToken();
      const res = await request('/api/returns', {
        method: 'POST',
        body: {
          transactionId: 'test-transaction',
          reason: 'DAMAGED',
          items: [],
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('item');
    });

    it('should reject zero quantity', async () => {
      const token = getTestToken();
      const res = await request('/api/returns', {
        method: 'POST',
        body: {
          transactionId: 'test-transaction',
          reason: 'DAMAGED',
          items: [{ productVariantId: 'test', quantity: 0, price: 10000 }],
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
    });

    it('should accept DAMAGED reason', async () => {
      const token = getTestToken();
      const res = await request('/api/returns', {
        method: 'POST',
        body: {
          transactionId: 'test-transaction',
          reason: 'DAMAGED',
          items: [{ productVariantId: 'test', quantity: 1, price: 10000 }],
          notes: 'Barang rusak saat pengiriman',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Validation passed
      expect([400]).not.toContain(res.status);
    });

    it('should accept WRONG_ITEM reason', async () => {
      const token = getTestToken();
      const res = await request('/api/returns', {
        method: 'POST',
        body: {
          transactionId: 'test-transaction',
          reason: 'WRONG_ITEM',
          items: [{ productVariantId: 'test', quantity: 2, price: 15000 }],
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([400]).not.toContain(res.status);
    });

    it('should accept EXPIRED reason', async () => {
      const token = getTestToken();
      const res = await request('/api/returns', {
        method: 'POST',
        body: {
          transactionId: 'test-transaction',
          reason: 'EXPIRED',
          items: [{ productVariantId: 'test', quantity: 5, price: 5000 }],
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([400]).not.toContain(res.status);
    });

    it('should accept CUSTOMER_REQUEST reason', async () => {
      const token = getTestToken();
      const res = await request('/api/returns', {
        method: 'POST',
        body: {
          transactionId: 'test-transaction',
          reason: 'CUSTOMER_REQUEST',
          items: [{ productVariantId: 'test', quantity: 1, price: 50000 }],
          refundMethod: 'CASH',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([400]).not.toContain(res.status);
    });

    it('should accept OTHER reason', async () => {
      const token = getTestToken();
      const res = await request('/api/returns', {
        method: 'POST',
        body: {
          transactionId: 'test-transaction',
          reason: 'OTHER',
          items: [{ productVariantId: 'test', quantity: 1, price: 20000 }],
          notes: 'Alasan khusus lainnya',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([400]).not.toContain(res.status);
    });
  });

  describe('GET /api/returns', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request('/api/returns');
      
      expect(res.status).toBe(401);
    });

    it('should accept authenticated request', async () => {
      const token = getTestToken();
      const res = await request('/api/returns', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([401, 403]).not.toContain(res.status);
    });
  });

  describe('GET /api/returns/stats', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request('/api/returns/stats');
      
      expect(res.status).toBe(401);
    });

    it('should accept authenticated request', async () => {
      const token = getTestToken();
      const res = await request('/api/returns/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([401, 403]).not.toContain(res.status);
    });
  });
});
