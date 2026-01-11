import { z } from 'zod';

// ==================== AUTH SCHEMAS ====================

export const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

export const registerSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  name: z.string().min(1, 'Nama wajib diisi'),
  role: z.enum(['OWNER', 'MANAGER', 'ADMIN', 'KASIR']).optional(),
  cabangId: z.string().optional(),
  storeName: z.string().optional(),
  branchName: z.string().optional(),
});

// ==================== TRANSACTION SCHEMAS ====================

export const transactionItemSchema = z.object({
  productVariantId: z.string().min(1, 'Product variant ID wajib diisi'),
  quantity: z.number().int().positive('Quantity harus lebih dari 0'),
  price: z.number().nonnegative('Price tidak boleh negatif'),
});

const paymentMethods = ['CASH', 'DEBIT', 'TRANSFER', 'QRIS'] as const;
const stockAdjustmentTypes = ['add', 'subtract'] as const;
const returnReasons = ['DAMAGED', 'WRONG_ITEM', 'EXPIRED', 'CUSTOMER_REQUEST', 'OTHER'] as const;

export const createTransactionSchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  items: z.array(transactionItemSchema).min(1, 'Minimal 1 item'),
  discount: z.number().nonnegative('Discount tidak boleh negatif').default(0),
  tax: z.number().nonnegative('Tax tidak boleh negatif').default(0),
  paymentMethod: z.enum(paymentMethods),
  bankName: z.string().optional(),
  referenceNo: z.string().optional(),
  cardLastDigits: z.string().optional(),
  isSplitPayment: z.boolean().default(false),
  paymentAmount1: z.number().positive().optional(),
  paymentMethod2: z.enum(paymentMethods).optional(),
  paymentAmount2: z.number().positive().optional(),
  bankName2: z.string().optional(),
  referenceNo2: z.string().optional(),
  notes: z.string().optional(),
  cabangId: z.string().optional(),
}).refine(
  (data) => {
    if (data.isSplitPayment) {
      return data.paymentMethod2 && data.paymentAmount1 && data.paymentAmount2;
    }
    return true;
  },
  { message: 'Split payment memerlukan paymentMethod2, paymentAmount1, dan paymentAmount2' }
).refine(
  (data) => {
    if (data.isSplitPayment && data.paymentMethod2) {
      return data.paymentMethod !== data.paymentMethod2;
    }
    return true;
  },
  { message: 'Payment method 1 dan 2 harus berbeda untuk split payment' }
);

// ==================== STOCK SCHEMAS ====================

export const stockAdjustmentSchema = z.object({
  variantId: z.string().min(1, 'Variant ID wajib diisi'),
  cabangId: z.string().min(1, 'Cabang ID wajib diisi'),
  type: z.enum(stockAdjustmentTypes),
  quantity: z.number().int().positive('Quantity harus lebih dari 0'),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export const stockTransferSchema = z.object({
  variantId: z.string().min(1, 'Variant ID wajib diisi'),
  fromCabangId: z.string().min(1, 'From Cabang ID wajib diisi'),
  toCabangId: z.string().min(1, 'To Cabang ID wajib diisi'),
  quantity: z.number().int().positive('Quantity harus lebih dari 0'),
  notes: z.string().optional(),
}).refine(
  (data) => data.fromCabangId !== data.toCabangId,
  { message: 'Tidak bisa transfer ke cabang yang sama' }
);

// ==================== RETURN SCHEMAS ====================

export const returnItemSchema = z.object({
  productVariantId: z.string().min(1, 'Product variant ID wajib diisi'),
  quantity: z.number().int().positive('Quantity harus lebih dari 0'),
  price: z.number().nonnegative('Price tidak boleh negatif'),
});

export const createReturnSchema = z.object({
  transactionId: z.string().min(1, 'Transaction ID wajib diisi'),
  reason: z.enum(returnReasons),
  notes: z.string().optional(),
  items: z.array(returnItemSchema).min(1, 'Minimal 1 item untuk return'),
  refundMethod: z.enum(paymentMethods).optional(),
  approvedBy: z.string().optional(),
});

// ==================== PRODUCT SCHEMAS ====================

export const stockDataSchema = z.object({
  cabangId: z.string().min(1),
  quantity: z.number().int().nonnegative().optional(),
  price: z.number().nonnegative().optional(),
});

export const variantDataSchema = z.object({
  id: z.string().optional(),
  sku: z.string().optional(),
  variantName: z.string().min(1, 'Variant name wajib diisi'),
  variantValue: z.string().min(1, 'Variant value wajib diisi'),
  weight: z.number().int().nonnegative().nullable().optional(),
  length: z.number().int().nonnegative().nullable().optional(),
  width: z.number().int().nonnegative().nullable().optional(),
  height: z.number().int().nonnegative().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  stocks: z.array(stockDataSchema).optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1, 'Nama produk wajib diisi'),
  description: z.string().optional(),
  categoryId: z.string().min(1, 'Category ID wajib diisi'),
  productType: z.enum(['SINGLE', 'VARIANT']),
  sku: z.string().optional(),
  variants: z.array(variantDataSchema).optional(),
  stocks: z.array(stockDataSchema).optional(),
  weight: z.number().int().nonnegative().nullable().optional(),
  length: z.number().int().nonnegative().nullable().optional(),
  width: z.number().int().nonnegative().nullable().optional(),
  height: z.number().int().nonnegative().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().default(true),
});

// ==================== ALERT SCHEMAS ====================

export const stockAlertSchema = z.object({
  variantId: z.string().min(1, 'Variant ID wajib diisi'),
  cabangId: z.string().min(1, 'Cabang ID wajib diisi'),
  minStock: z.number().int().nonnegative('Min stock tidak boleh negatif'),
});

// ==================== CATEGORY SCHEMAS ====================

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Nama kategori wajib diisi'),
  description: z.string().optional(),
});

// ==================== HELPER FUNCTIONS ====================

export type ValidationResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  // Format first error message for user-friendly response
  const firstIssue = result.error.issues[0];
  const field = firstIssue.path.join('.');
  const message = field ? `${field}: ${firstIssue.message}` : firstIssue.message;
  
  return { success: false, error: message };
}

// Type exports
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type StockTransferInput = z.infer<typeof stockTransferSchema>;
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type StockAlertInput = z.infer<typeof stockAlertSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
