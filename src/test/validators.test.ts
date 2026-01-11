import { describe, it, expect } from 'vitest';
import { validate } from '../lib/validators.js';
import {
  loginSchema,
  registerSchema,
  createTransactionSchema,
  stockAdjustmentSchema,
  stockTransferSchema,
  createReturnSchema,
} from '../lib/validators.js';

describe('Zod Validators Unit Tests', () => {
  describe('loginSchema', () => {
    it('should accept valid credentials', () => {
      const result = validate(loginSchema, {
        email: 'test@example.com',
        password: '123456',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = validate(loginSchema, {
        email: 'not-an-email',
        password: '123456',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('email');
      }
    });

    it('should reject empty password', () => {
      const result = validate(loginSchema, {
        email: 'test@example.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('should accept valid registration', () => {
      const result = validate(registerSchema, {
        email: 'new@example.com',
        password: '123456',
        name: 'New User',
      });
      expect(result.success).toBe(true);
    });

    it('should reject short password', () => {
      const result = validate(registerSchema, {
        email: 'new@example.com',
        password: '12345',
        name: 'New User',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('6');
      }
    });

    it('should reject empty name', () => {
      const result = validate(registerSchema, {
        email: 'new@example.com',
        password: '123456',
        name: '',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional role', () => {
      const result = validate(registerSchema, {
        email: 'new@example.com',
        password: '123456',
        name: 'New User',
        role: 'ADMIN',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('ADMIN');
      }
    });
  });

  describe('createTransactionSchema', () => {
    it('should accept valid transaction', () => {
      const result = validate(createTransactionSchema, {
        items: [{ productVariantId: 'test-id', quantity: 2, price: 15000 }],
        paymentMethod: 'CASH',
      });
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const result = validate(createTransactionSchema, {
        items: [{ productVariantId: 'test-id', quantity: 1, price: 10000 }],
        paymentMethod: 'CASH',
      });
      if (result.success) {
        expect(result.data.discount).toBe(0);
        expect(result.data.tax).toBe(0);
        expect(result.data.isSplitPayment).toBe(false);
      }
    });

    it('should reject empty items', () => {
      const result = validate(createTransactionSchema, {
        items: [],
        paymentMethod: 'CASH',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('item');
      }
    });

    it('should reject invalid payment method', () => {
      const result = validate(createTransactionSchema, {
        items: [{ productVariantId: 'test-id', quantity: 1, price: 10000 }],
        paymentMethod: 'BITCOIN',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid payment methods', () => {
      const methods = ['CASH', 'DEBIT', 'TRANSFER', 'QRIS'];
      methods.forEach(method => {
        const result = validate(createTransactionSchema, {
          items: [{ productVariantId: 'test-id', quantity: 1, price: 10000 }],
          paymentMethod: method,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should validate split payment rules', () => {
      // Missing paymentMethod2
      const result1 = validate(createTransactionSchema, {
        items: [{ productVariantId: 'test-id', quantity: 1, price: 10000 }],
        paymentMethod: 'CASH',
        isSplitPayment: true,
        paymentAmount1: 5000,
        paymentAmount2: 5000,
      });
      expect(result1.success).toBe(false);

      // Same payment method
      const result2 = validate(createTransactionSchema, {
        items: [{ productVariantId: 'test-id', quantity: 1, price: 10000 }],
        paymentMethod: 'CASH',
        isSplitPayment: true,
        paymentMethod2: 'CASH',
        paymentAmount1: 5000,
        paymentAmount2: 5000,
      });
      expect(result2.success).toBe(false);

      // Valid split payment
      const result3 = validate(createTransactionSchema, {
        items: [{ productVariantId: 'test-id', quantity: 1, price: 10000 }],
        paymentMethod: 'CASH',
        isSplitPayment: true,
        paymentMethod2: 'QRIS',
        paymentAmount1: 5000,
        paymentAmount2: 5000,
      });
      expect(result3.success).toBe(true);
    });
  });

  describe('stockAdjustmentSchema', () => {
    it('should accept valid adjustment', () => {
      const result = validate(stockAdjustmentSchema, {
        variantId: 'test-variant',
        cabangId: 'test-cabang',
        type: 'add',
        quantity: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should accept add and subtract types', () => {
      const types = ['add', 'subtract'];
      types.forEach(type => {
        const result = validate(stockAdjustmentSchema, {
          variantId: 'test-variant',
          cabangId: 'test-cabang',
          type,
          quantity: 5,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid type', () => {
      const result = validate(stockAdjustmentSchema, {
        variantId: 'test-variant',
        cabangId: 'test-cabang',
        type: 'multiply',
        quantity: 5,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-positive quantity', () => {
      const result1 = validate(stockAdjustmentSchema, {
        variantId: 'test-variant',
        cabangId: 'test-cabang',
        type: 'add',
        quantity: 0,
      });
      expect(result1.success).toBe(false);

      const result2 = validate(stockAdjustmentSchema, {
        variantId: 'test-variant',
        cabangId: 'test-cabang',
        type: 'add',
        quantity: -5,
      });
      expect(result2.success).toBe(false);
    });
  });

  describe('stockTransferSchema', () => {
    it('should accept valid transfer', () => {
      const result = validate(stockTransferSchema, {
        variantId: 'test-variant',
        fromCabangId: 'cabang-a',
        toCabangId: 'cabang-b',
        quantity: 20,
      });
      expect(result.success).toBe(true);
    });

    it('should reject transfer to same cabang', () => {
      const result = validate(stockTransferSchema, {
        variantId: 'test-variant',
        fromCabangId: 'same-cabang',
        toCabangId: 'same-cabang',
        quantity: 10,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('sama');
      }
    });

    it('should reject missing fields', () => {
      const result = validate(stockTransferSchema, {
        variantId: 'test-variant',
        fromCabangId: 'cabang-a',
        quantity: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createReturnSchema', () => {
    it('should accept valid return', () => {
      const result = validate(createReturnSchema, {
        transactionId: 'test-transaction',
        reason: 'DAMAGED',
        items: [{ productVariantId: 'test-id', quantity: 1, price: 10000 }],
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid reasons', () => {
      const reasons = ['DAMAGED', 'WRONG_ITEM', 'EXPIRED', 'CUSTOMER_REQUEST', 'OTHER'];
      reasons.forEach(reason => {
        const result = validate(createReturnSchema, {
          transactionId: 'test-transaction',
          reason,
          items: [{ productVariantId: 'test-id', quantity: 1, price: 10000 }],
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid reason', () => {
      const result = validate(createReturnSchema, {
        transactionId: 'test-transaction',
        reason: 'INVALID_REASON',
        items: [{ productVariantId: 'test-id', quantity: 1, price: 10000 }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty items', () => {
      const result = validate(createReturnSchema, {
        transactionId: 'test-transaction',
        reason: 'DAMAGED',
        items: [],
      });
      expect(result.success).toBe(false);
    });
  });
});
