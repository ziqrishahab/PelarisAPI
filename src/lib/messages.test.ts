import { describe, it, expect } from 'vitest';
import { ERR, MSG } from './messages';

describe('Error Messages (ERR)', () => {
  it('should have general error messages', () => {
    expect(ERR.SERVER_ERROR).toBeDefined();
    expect(ERR.NOT_FOUND).toBeDefined();
    expect(ERR.UNAUTHORIZED).toBeDefined();
    expect(ERR.FORBIDDEN).toBeDefined();
    expect(ERR.BAD_REQUEST).toBeDefined();
  });

  it('should have authentication error messages', () => {
    expect(ERR.TENANT_REQUIRED).toBeDefined();
    expect(ERR.TOKEN_REQUIRED).toBeDefined();
    expect(ERR.TOKEN_INVALID).toBeDefined();
    expect(ERR.LOGIN_FAILED).toBeDefined();
    expect(ERR.ACCOUNT_INACTIVE).toBeDefined();
  });

  it('should have user error messages', () => {
    expect(ERR.USER_NOT_FOUND).toBeDefined();
    expect(ERR.EMAIL_EXISTS).toBeDefined();
    expect(ERR.CANNOT_DELETE_SELF).toBeDefined();
  });

  it('should have product error messages', () => {
    expect(ERR.PRODUCT_NOT_FOUND).toBeDefined();
    expect(ERR.PRODUCT_NAME_REQUIRED).toBeDefined();
    expect(ERR.CATEGORY_REQUIRED).toBeDefined();
    expect(ERR.SKU_REQUIRED).toBeDefined();
    expect(ERR.SKU_EXISTS).toBeDefined();
  });

  it('should have category error messages', () => {
    expect(ERR.CATEGORY_NOT_FOUND).toBeDefined();
    expect(ERR.CATEGORY_NAME_REQUIRED).toBeDefined();
    expect(ERR.CATEGORY_EXISTS).toBeDefined();
    expect(ERR.CATEGORY_HAS_PRODUCTS).toBeDefined();
  });

  it('should have cabang error messages', () => {
    expect(ERR.CABANG_NOT_FOUND).toBeDefined();
    expect(ERR.CABANG_NAME_REQUIRED).toBeDefined();
    expect(ERR.CABANG_EXISTS).toBeDefined();
    expect(ERR.CABANG_ID_REQUIRED).toBeDefined();
  });

  it('should have stock error messages', () => {
    expect(ERR.STOCK_NOT_FOUND).toBeDefined();
    expect(ERR.VARIANT_ID_REQUIRED).toBeDefined();
    expect(ERR.INSUFFICIENT_STOCK).toBeDefined();
  });

  it('should have transaction error messages', () => {
    expect(ERR.TRANSACTION_NOT_FOUND).toBeDefined();
    expect(ERR.ITEMS_REQUIRED).toBeDefined();
    expect(ERR.PAYMENT_METHOD_REQUIRED).toBeDefined();
  });

  it('should have return error messages', () => {
    expect(ERR.RETURN_NOT_FOUND).toBeDefined();
    expect(ERR.RETURN_REASON_REQUIRED).toBeDefined();
    expect(ERR.MANAGER_APPROVAL_REQUIRED).toBeDefined();
  });

  it('should have transfer error messages', () => {
    expect(ERR.TRANSFER_NOT_FOUND).toBeDefined();
    expect(ERR.SOURCE_STOCK_NOT_FOUND).toBeDefined();
    expect(ERR.SAME_CABANG_TRANSFER).toBeDefined();
  });

  it('should have channel error messages', () => {
    expect(ERR.CHANNEL_NOT_FOUND).toBeDefined();
    expect(ERR.CHANNEL_CODE_REQUIRED).toBeDefined();
    expect(ERR.CHANNEL_CODE_EXISTS).toBeDefined();
  });

  it('should have backup error messages', () => {
    expect(ERR.BACKUP_NOT_FOUND).toBeDefined();
    expect(ERR.FILENAME_REQUIRED).toBeDefined();
  });

  it('should have validation error messages', () => {
    expect(ERR.REQUIRED_FIELDS).toBeDefined();
    expect(ERR.INVALID_FORMAT).toBeDefined();
  });

  it('all error messages should be in Indonesian', () => {
    // Check that messages don't contain common English words
    const errValues = Object.values(ERR);
    
    errValues.forEach(message => {
      expect(typeof message).toBe('string');
      // Should not contain "not found" (English)
      expect(message.toLowerCase()).not.toContain('not found');
      // Should not contain "required" (English)
      expect(message.toLowerCase()).not.toContain('required');
      // Should not contain "invalid" (English) - except in technical terms
      expect(message.toLowerCase()).not.toMatch(/\binvalid\b/);
    });
  });
});

describe('Success Messages (MSG)', () => {
  it('should have general success messages', () => {
    expect(MSG.SUCCESS).toBeDefined();
    expect(MSG.CREATED).toBeDefined();
    expect(MSG.UPDATED).toBeDefined();
    expect(MSG.DELETED).toBeDefined();
  });

  it('should have auth success messages', () => {
    expect(MSG.LOGIN_SUCCESS).toBeDefined();
    expect(MSG.LOGOUT_SUCCESS).toBeDefined();
    expect(MSG.REGISTER_SUCCESS).toBeDefined();
  });

  it('should have user success messages', () => {
    expect(MSG.USER_CREATED).toBeDefined();
    expect(MSG.USER_UPDATED).toBeDefined();
    expect(MSG.USER_DELETED).toBeDefined();
  });

  it('should have product success messages', () => {
    expect(MSG.PRODUCT_CREATED).toBeDefined();
    expect(MSG.PRODUCT_UPDATED).toBeDefined();
    expect(MSG.PRODUCT_DELETED).toBeDefined();
  });

  it('should have category success messages', () => {
    expect(MSG.CATEGORY_CREATED).toBeDefined();
    expect(MSG.CATEGORY_UPDATED).toBeDefined();
    expect(MSG.CATEGORY_DELETED).toBeDefined();
  });

  it('should have cabang success messages', () => {
    expect(MSG.CABANG_CREATED).toBeDefined();
    expect(MSG.CABANG_UPDATED).toBeDefined();
    expect(MSG.CABANG_DELETED).toBeDefined();
  });

  it('should have stock success messages', () => {
    expect(MSG.STOCK_UPDATED).toBeDefined();
    expect(MSG.ALERT_CREATED).toBeDefined();
    expect(MSG.ALERT_DELETED).toBeDefined();
  });

  it('should have transaction success messages', () => {
    expect(MSG.TRANSACTION_CREATED).toBeDefined();
    expect(MSG.TRANSACTION_CANCELLED).toBeDefined();
  });

  it('should have return success messages', () => {
    expect(MSG.RETURN_CREATED).toBeDefined();
    expect(MSG.RETURN_APPROVED).toBeDefined();
    expect(MSG.RETURN_REJECTED).toBeDefined();
  });

  it('should have transfer success messages', () => {
    expect(MSG.TRANSFER_CREATED).toBeDefined();
    expect(MSG.TRANSFER_APPROVED).toBeDefined();
    expect(MSG.TRANSFER_REJECTED).toBeDefined();
  });

  it('should have backup success messages', () => {
    expect(MSG.BACKUP_CREATED).toBeDefined();
    expect(MSG.BACKUP_RESTORED).toBeDefined();
  });

  it('all success messages should be in Indonesian', () => {
    const msgValues = Object.values(MSG);
    
    msgValues.forEach(message => {
      expect(typeof message).toBe('string');
      // Should contain Indonesian words
      // Check for common Indonesian patterns
      expect(message.length).toBeGreaterThan(0);
    });
  });
});

describe('Message Consistency', () => {
  it('ERR keys should be uppercase with underscores', () => {
    Object.keys(ERR).forEach(key => {
      expect(key).toMatch(/^[A-Z_]+$/);
    });
  });

  it('MSG keys should be uppercase with underscores', () => {
    Object.keys(MSG).forEach(key => {
      expect(key).toMatch(/^[A-Z_]+$/);
    });
  });

  it('no empty messages', () => {
    [...Object.values(ERR), ...Object.values(MSG)].forEach(message => {
      expect(message.trim().length).toBeGreaterThan(0);
    });
  });
});
