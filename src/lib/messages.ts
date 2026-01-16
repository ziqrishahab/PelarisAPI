/**
 * Centralized Error & Success Messages (Indonesian)
 * 
 * Provides consistent Indonesian messages across all endpoints.
 */

// ==================== ERROR MESSAGES ====================

export const ERR = {
  // General
  SERVER_ERROR: 'Terjadi kesalahan server',
  NOT_FOUND: 'Data tidak ditemukan',
  UNAUTHORIZED: 'Tidak memiliki akses',
  FORBIDDEN: 'Akses ditolak',
  BAD_REQUEST: 'Request tidak valid',
  
  // Authentication
  TENANT_REQUIRED: 'Diperlukan scope tenant',
  TOKEN_REQUIRED: 'Token tidak ditemukan',
  TOKEN_INVALID: 'Token tidak valid',
  LOGIN_FAILED: 'Email atau password salah',
  ACCOUNT_INACTIVE: 'Akun Anda tidak aktif',
  
  // User
  USER_NOT_FOUND: 'User tidak ditemukan',
  EMAIL_EXISTS: 'Email sudah terdaftar',
  CANNOT_DELETE_SELF: 'Tidak bisa menghapus akun sendiri',
  
  // Product
  PRODUCT_NOT_FOUND: 'Produk tidak ditemukan',
  PRODUCT_NAME_REQUIRED: 'Nama produk wajib diisi',
  CATEGORY_REQUIRED: 'Kategori wajib dipilih',
  PRODUCT_TYPE_REQUIRED: 'Tipe produk wajib dipilih',
  SKU_REQUIRED: 'SKU wajib diisi untuk produk satuan',
  SKU_EXISTS: 'SKU sudah terdaftar',
  VARIANT_REQUIRED: 'Minimal 1 varian diperlukan untuk produk varian',
  STOCK_REQUIRED: 'Minimal 1 cabang dengan harga diperlukan',
  
  // Category
  CATEGORY_NOT_FOUND: 'Kategori tidak ditemukan',
  CATEGORY_NAME_REQUIRED: 'Nama kategori wajib diisi',
  CATEGORY_EXISTS: 'Nama kategori sudah ada',
  CATEGORY_HAS_PRODUCTS: 'Kategori masih memiliki produk',
  
  // Cabang
  CABANG_NOT_FOUND: 'Cabang tidak ditemukan',
  CABANG_NAME_REQUIRED: 'Nama cabang wajib diisi',
  CABANG_EXISTS: 'Nama cabang sudah ada',
  CABANG_ID_REQUIRED: 'cabangId wajib diisi',
  
  // Stock
  STOCK_NOT_FOUND: 'Data stok tidak ditemukan',
  VARIANT_ID_REQUIRED: 'variantId wajib diisi',
  MIN_STOCK_REQUIRED: 'Minimal stok wajib diisi',
  INSUFFICIENT_STOCK: 'Stok tidak mencukupi',
  
  // Transaction
  TRANSACTION_NOT_FOUND: 'Transaksi tidak ditemukan',
  ITEMS_REQUIRED: 'Minimal 1 item diperlukan',
  PAYMENT_METHOD_REQUIRED: 'Metode pembayaran wajib dipilih',
  
  // Return
  RETURN_NOT_FOUND: 'Return tidak ditemukan',
  RETURN_REASON_REQUIRED: 'Alasan return wajib diisi',
  MANAGER_APPROVAL_REQUIRED: 'Memerlukan persetujuan Manager',
  
  // Transfer
  TRANSFER_NOT_FOUND: 'Transfer tidak ditemukan',
  SOURCE_STOCK_NOT_FOUND: 'Stok asal tidak ditemukan',
  SAME_CABANG_TRANSFER: 'Tidak bisa transfer ke cabang yang sama',
  
  // Channel
  CHANNEL_NOT_FOUND: 'Channel tidak ditemukan',
  CHANNEL_CODE_REQUIRED: 'Kode channel wajib diisi',
  CHANNEL_CODE_EXISTS: 'Kode channel sudah ada',
  
  // Backup
  BACKUP_NOT_FOUND: 'File backup tidak ditemukan',
  FILENAME_REQUIRED: 'Nama file wajib diisi',
  
  // Validation
  REQUIRED_FIELDS: 'Data wajib tidak lengkap',
  INVALID_FORMAT: 'Format tidak valid',
} as const;

// ==================== SUCCESS MESSAGES ====================

export const MSG = {
  // General
  SUCCESS: 'Berhasil',
  CREATED: 'Data berhasil dibuat',
  UPDATED: 'Data berhasil diupdate',
  DELETED: 'Data berhasil dihapus',
  
  // Auth
  LOGIN_SUCCESS: 'Login berhasil',
  LOGOUT_SUCCESS: 'Logout berhasil',
  REGISTER_SUCCESS: 'Registrasi berhasil',
  
  // User
  USER_CREATED: 'User berhasil dibuat',
  USER_UPDATED: 'User berhasil diupdate',
  USER_DELETED: 'User berhasil dihapus',
  USER_DEACTIVATED: 'User telah dinonaktifkan',
  
  // Product
  PRODUCT_CREATED: 'Produk berhasil dibuat',
  PRODUCT_UPDATED: 'Produk berhasil diupdate',
  PRODUCT_DELETED: 'Produk berhasil dihapus',
  PRODUCT_DEACTIVATED: 'Produk telah dinonaktifkan',
  
  // Category
  CATEGORY_CREATED: 'Kategori berhasil dibuat',
  CATEGORY_UPDATED: 'Kategori berhasil diupdate',
  CATEGORY_DELETED: 'Kategori berhasil dihapus',
  
  // Cabang
  CABANG_CREATED: 'Cabang berhasil dibuat',
  CABANG_UPDATED: 'Cabang berhasil diupdate',
  CABANG_DELETED: 'Cabang berhasil dihapus',
  
  // Stock
  STOCK_UPDATED: 'Stok berhasil diupdate',
  ALERT_CREATED: 'Alert stok berhasil dibuat',
  ALERT_DELETED: 'Alert stok berhasil dihapus',
  
  // Transaction
  TRANSACTION_CREATED: 'Transaksi berhasil',
  TRANSACTION_CANCELLED: 'Transaksi berhasil dibatalkan',
  
  // Return
  RETURN_CREATED: 'Return berhasil dibuat',
  RETURN_APPROVED: 'Return berhasil disetujui',
  RETURN_REJECTED: 'Return ditolak',
  
  // Transfer
  TRANSFER_CREATED: 'Transfer berhasil dibuat',
  TRANSFER_APPROVED: 'Transfer berhasil disetujui',
  TRANSFER_REJECTED: 'Transfer ditolak',
  
  // Backup
  BACKUP_CREATED: 'Backup berhasil dibuat',
  BACKUP_RESTORED: 'Backup berhasil di-restore',
} as const;

// ==================== HELPER FUNCTIONS ====================

/**
 * Format error response
 */
export function errorResponse(message: string, statusCode: number = 400) {
  return { error: message, statusCode };
}

/**
 * Format success response
 */
export function successResponse(message: string, data?: any) {
  return { message, ...(data && { data }) };
}

/**
 * Format not found error with entity name
 */
export function notFoundError(entity: string) {
  return { error: `${entity} tidak ditemukan` };
}

/**
 * Format already exists error with entity name
 */
export function existsError(entity: string) {
  return { error: `${entity} sudah ada` };
}
