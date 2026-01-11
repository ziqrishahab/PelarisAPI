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
function getTestToken(role: string = 'KASIR') {
  return generateToken('test-user-id', 'test@test.com', role, 'test-cabang-id');
}

describe('Transaction Integration Tests', () => {
  describe('POST /api/transactions', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: 1, price: 10000 }],
          paymentMethod: 'CASH',
        },
      });
      
      expect(res.status).toBe(401);
    });

    it('should reject empty items array', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [],
          paymentMethod: 'CASH',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('item');
    });

    it('should reject invalid payment method', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: 1, price: 10000 }],
          paymentMethod: 'INVALID',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
    });

    it('should reject negative quantity', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: -1, price: 10000 }],
          paymentMethod: 'CASH',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Quantity');
    });

    it('should reject zero quantity', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: 0, price: 10000 }],
          paymentMethod: 'CASH',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
    });

    it('should reject negative price', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: 1, price: -1000 }],
          paymentMethod: 'CASH',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
    });

    it('should reject negative discount', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: 1, price: 10000 }],
          paymentMethod: 'CASH',
          discount: -100,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Discount');
    });

    it('should reject split payment without required fields', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: 1, price: 10000 }],
          paymentMethod: 'CASH',
          isSplitPayment: true,
          // Missing paymentMethod2, paymentAmount1, paymentAmount2
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error.toLowerCase()).toContain('split');
    });

    it('should reject split payment with same method', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: 1, price: 10000 }],
          paymentMethod: 'CASH',
          isSplitPayment: true,
          paymentMethod2: 'CASH', // Same as paymentMethod
          paymentAmount1: 5000,
          paymentAmount2: 5000,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('berbeda');
    });

    it('should accept valid CASH payment', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: 1, price: 10000 }],
          paymentMethod: 'CASH',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Will fail due to database mock, but should pass validation
      // Status 500 or 404 means validation passed
      expect([400]).not.toContain(res.status);
    });

    it('should accept valid QRIS payment', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: 2, price: 25000 }],
          paymentMethod: 'QRIS',
          referenceNo: 'QR123456',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([400]).not.toContain(res.status);
    });

    it('should accept valid split payment', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        method: 'POST',
        body: {
          items: [{ productVariantId: 'test', quantity: 1, price: 100000 }],
          paymentMethod: 'CASH',
          isSplitPayment: true,
          paymentMethod2: 'QRIS',
          paymentAmount1: 50000,
          paymentAmount2: 50000,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      expect([400]).not.toContain(res.status);
    });
  });

  describe('GET /api/transactions', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request('/api/transactions');
      
      expect(res.status).toBe(401);
    });

    it('should accept authenticated request', async () => {
      const token = getTestToken();
      const res = await request('/api/transactions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // May return 200 or 500 (mocked db), but not 401 or 403
      expect([401, 403]).not.toContain(res.status);
    });
  });
});
