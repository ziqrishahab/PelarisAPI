import { Server } from 'socket.io';
import logger from './logger.js';

// ==================== SOCKET PAYLOAD TYPES ====================

/**
 * Generic socket payload wrapper
 */
export interface SocketPayload<T> {
  type: string;
  data: T;
  timestamp: Date;
}

/**
 * Product data for socket events (flexible to match Prisma output)
 */
export interface ProductSocketData {
  id: string;
  name: string;
  categoryId?: string;
  productType?: 'SINGLE' | 'VARIANT';
  isActive?: boolean;
  variants?: Array<{
    id: string;
    sku: string;
    variantName: string;
    variantValue: string;
    stocks?: Array<{
      cabangId: string;
      quantity: number;
      price: number;
    }>;
  }>;
  category?: {
    id: string;
    name: string;
  };
  [key: string]: unknown; // Allow additional Prisma fields
}

/**
 * Stock update data for socket events (flexible)
 */
export interface StockSocketData {
  productVariantId?: string;
  variantId?: string; // Alias for productVariantId
  cabangId?: string;
  quantity: number;
  price?: number;
  previousQty?: number;
  previousQuantity?: number; // Alias for backwards compatibility
  productId?: string;
  type?: string; // For transfer events
  fromCabangId?: string;
  toCabangId?: string;
  transferId?: string;
  adjustmentId?: string;
  operation?: string;
  [key: string]: unknown; // Allow additional fields
}

/**
 * Transaction data for socket events
 */
export interface TransactionSocketData {
  id: string;
  transactionNo: string;
  cabangId: string;
  total: number;
  status: string;
  itemCount?: number;
  [key: string]: unknown; // Allow additional fields
}

/**
 * Category data for socket events
 */
export interface CategorySocketData {
  id: string;
  name: string;
  description?: string | null;
  [key: string]: unknown;
}

/**
 * Settings data for socket events
 */
export interface SettingsSocketData {
  key: string;
  value: string;
  [key: string]: unknown;
}

/**
 * Deleted entity reference
 */
export interface DeletedEntityData {
  id: string;
}

// ==================== SOCKET INITIALIZATION ====================

let io: Server | null = null;

export function initSocket(socketIo: Server): void {
  io = socketIo;
  logger.info('[Socket] Socket.io initialized');
}

export function getIO(): Server | null {
  if (!io) {
    logger.warn('[Socket] Socket.io not initialized yet');
  }
  return io;
}

// ==================== EMIT HELPERS ====================

/**
 * Helper to emit to specific tenant room, or broadcast if no tenant specified
 */
function emitToTenant<T>(event: string, data: T, tenantId?: string): void {
  if (!io) return;
  
  const payload: SocketPayload<T> = {
    type: event,
    data,
    timestamp: new Date()
  };
  
  if (tenantId) {
    io.to(`tenant:${tenantId}`).emit(event, payload);
  } else {
    io.emit(event, payload);
  }
}

/**
 * Helper to emit to specific cabang room
 */
function emitToCabang<T>(event: string, data: T, cabangId?: string, tenantId?: string): void {
  if (!io) return;
  
  const payload: SocketPayload<T> = {
    type: event,
    data,
    timestamp: new Date()
  };
  
  if (cabangId) {
    io.to(`cabang:${cabangId}`).emit(event, payload);
  } else if (tenantId) {
    io.to(`tenant:${tenantId}`).emit(event, payload);
  } else {
    io.emit(event, payload);
  }
}

// ==================== PRODUCT EVENTS ====================

export function emitProductCreated(product: ProductSocketData | null, tenantId?: string): void {
  if (!product) return;
  emitToTenant('product:created', product, tenantId);
}

export function emitProductUpdated(product: ProductSocketData | null, tenantId?: string): void {
  if (!product) return;
  emitToTenant('product:updated', product, tenantId);
}

export function emitProductDeleted(productId: string, tenantId?: string): void {
  emitToTenant<DeletedEntityData>('product:deleted', { id: productId }, tenantId);
}

// ==================== STOCK EVENTS ====================

export function emitStockUpdated(stockData: StockSocketData, cabangId?: string, tenantId?: string): void {
  // Stock updates are cabang-specific
  emitToCabang('stock:updated', stockData, cabangId, tenantId);
}

// ==================== TRANSACTION EVENTS ====================

export function emitTransactionCreated(transaction: TransactionSocketData, cabangId?: string, tenantId?: string): void {
  emitToCabang('transaction:created', transaction, cabangId, tenantId);
}

// ==================== SETTINGS EVENTS ====================

export function emitSettingsUpdated(settings: SettingsSocketData, tenantId?: string): void {
  emitToTenant('settings:updated', settings, tenantId);
}

// ==================== CATEGORY EVENTS ====================

export function emitCategoryUpdated(category: CategorySocketData, tenantId?: string): void {
  emitToTenant('category:updated', category, tenantId);
}
