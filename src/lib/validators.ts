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
const returnReasons = ['CUSTOMER_REQUEST', 'OTHER', 'WRONG_SIZE', 'WRONG_ITEM', 'DEFECTIVE', 'EXPIRED'] as const;

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

export const exchangeItemSchema = z.object({
  productVariantId: z.string().min(1, 'Product variant ID wajib diisi'),
  quantity: z.number().int().positive('Quantity harus lebih dari 0'),
});

export const createReturnSchema = z.object({
  transactionId: z.string().min(1, 'Transaction ID wajib diisi'),
  reason: z.enum(returnReasons),
  reasonDetail: z.string().optional(),
  notes: z.string().optional(),
  photoUrls: z.array(z.string()).optional(),
  conditionNote: z.string().optional(),
  items: z.array(returnItemSchema).min(1, 'Minimal 1 item untuk return'),
  refundMethod: z.enum(paymentMethods).optional(),
  approvedBy: z.string().optional(),
  managerOverride: z.boolean().optional(),
  exchangeItems: z.array(exchangeItemSchema).optional(), // For WRONG_SIZE and WRONG_ITEM
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

export const updateCategorySchema = z.object({
  name: z.string().min(1, 'Nama kategori wajib diisi').optional(),
  description: z.string().optional(),
});

// ==================== CABANG SCHEMAS ====================

export const createCabangSchema = z.object({
  name: z.string().min(1, 'Nama cabang wajib diisi'),
  address: z.string().min(1, 'Alamat cabang wajib diisi'),
  phone: z.string().optional(),
});

export const updateCabangSchema = z.object({
  name: z.string().min(1, 'Nama cabang wajib diisi').optional(),
  address: z.string().min(1, 'Alamat cabang wajib diisi').optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

// ==================== CHANNEL SCHEMAS ====================

export const createChannelSchema = z.object({
  code: z.string().min(1, 'Kode channel wajib diisi').max(20),
  name: z.string().min(1, 'Nama channel wajib diisi').max(100),
  type: z.enum(['POS', 'MARKETPLACE', 'WEBSITE', 'SOCIAL', 'OTHER']).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  apiConfig: z.record(z.string(), z.any()).nullable().optional(),
  fieldMapping: z.record(z.string(), z.any()).nullable().optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1, 'Nama channel wajib diisi').max(100).optional(),
  type: z.enum(['POS', 'MARKETPLACE', 'WEBSITE', 'SOCIAL', 'OTHER']).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
  apiConfig: z.record(z.string(), z.any()).nullable().optional(),
  fieldMapping: z.record(z.string(), z.any()).nullable().optional(),
});

export const channelStockAllocationSchema = z.object({
  variantId: z.string().min(1, 'Variant ID wajib diisi'),
  allocatedQty: z.number().int().nonnegative('Alokasi tidak boleh negatif'),
});

// ==================== USER SCHEMAS ====================

export const createUserSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  name: z.string().min(1, 'Nama wajib diisi'),
  role: z.enum(['OWNER', 'MANAGER', 'ADMIN', 'KASIR']),
  cabangId: z.string().optional(),
  hasMultiCabangAccess: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  role: z.enum(['OWNER', 'MANAGER', 'ADMIN', 'KASIR']),
  cabangId: z.string().optional(),
  password: z.string().min(6).optional(),
  isActive: z.boolean().optional(),
  hasMultiCabangAccess: z.boolean().optional(),
});

// ==================== TENANT SCHEMAS ====================

export const createTenantSchema = z.object({
  name: z.string().min(1, 'Nama tenant wajib diisi').max(100),
  slug: z.string().min(1, 'Slug wajib diisi').max(50).regex(/^[a-z0-9-]+$/, 'Slug hanya boleh huruf kecil, angka, dan strip'),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1, 'Nama tenant wajib diisi').max(100).optional(),
  slug: z.string().min(1, 'Slug wajib diisi').max(50).regex(/^[a-z0-9-]+$/, 'Slug hanya boleh huruf kecil, angka, dan strip').optional(),
});

// ==================== RETURN APPROVAL SCHEMAS ====================

export const approveReturnSchema = z.object({
  approvedBy: z.string().min(1, 'Nama approver wajib diisi'),
});

export const rejectReturnSchema = z.object({
  rejectedBy: z.string().min(1, 'Nama yang menolak wajib diisi'),
  rejectionNotes: z.string().optional(),
});

// ==================== BACKUP SCHEMAS ====================

export const restoreBackupSchema = z.object({
  filename: z.string().min(1, 'Nama file wajib diisi'),
});

export const toggleAutoBackupSchema = z.object({
  enabled: z.boolean(),
});

// ==================== SYNC SCHEMAS ====================

export const deltaSyncSchema = z.object({
  updatedAfter: z.string().min(1, 'updatedAfter wajib diisi'),
});

const syncTransactionItemSchema = z.object({
  productVariantId: z.string(),
  productName: z.string(),
  variantInfo: z.string().optional(),
  sku: z.string().optional(),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
});

const syncTransactionSchema = z.object({
  id: z.string().optional(),
  transactionNo: z.string().optional(),
  cabangId: z.string().min(1),
  kasirId: z.string().optional(),
  kasirName: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  items: z.array(syncTransactionItemSchema).min(1, 'Minimal 1 item diperlukan'),
  discount: z.number().nonnegative().optional(),
  paymentMethod: z.enum(['CASH', 'DEBIT', 'TRANSFER', 'QRIS']),
  bankName: z.string().optional(),
  referenceNo: z.string().optional(),
  isSplitPayment: z.boolean().optional(),
  paymentAmount1: z.number().optional(),
  paymentMethod2: z.enum(['CASH', 'DEBIT', 'TRANSFER', 'QRIS']).optional(),
  paymentAmount2: z.number().optional(),
  bankName2: z.string().optional(),
  referenceNo2: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string().optional(),
});

export const batchTransactionSyncSchema = z.object({
  transactions: z.array(syncTransactionSchema).min(1, 'Minimal 1 transaksi diperlukan'),
});

// ==================== SETTINGS SCHEMAS ====================

export const updateAppSettingsSchema = z.object({
  returnEnabled: z.boolean().optional(),
  returnDeadlineDays: z.number().int().positive().optional(),
  returnRequiresApproval: z.boolean().optional(),
  exchangeEnabled: z.boolean().optional(),
});

export const updatePrinterSettingsSchema = z.object({
  cabangId: z.string().min(1, 'Cabang ID wajib diisi'),
  autoPrintEnabled: z.boolean().optional(),
  printerName: z.string().optional(),
  paperWidth: z.union([z.literal(58), z.literal(80)]).optional(),
  branchName: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  footerText1: z.string().optional(),
  footerText2: z.string().optional(),
});

export const updateSettingsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

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
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateCabangInput = z.infer<typeof createCabangSchema>;
export type UpdateCabangInput = z.infer<typeof updateCabangSchema>;
export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsSchema>;
export type UpdatePrinterSettingsInput = z.infer<typeof updatePrinterSettingsSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type ChannelStockAllocationInput = z.infer<typeof channelStockAllocationSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type ApproveReturnInput = z.infer<typeof approveReturnSchema>;
export type RejectReturnInput = z.infer<typeof rejectReturnSchema>;
export type RestoreBackupInput = z.infer<typeof restoreBackupSchema>;
export type ToggleAutoBackupInput = z.infer<typeof toggleAutoBackupSchema>;