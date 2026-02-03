import { Server } from 'socket.io';
import logger from './logger.js';

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

// Helper to emit to specific tenant room, or broadcast if no tenant specified
function emitToTenant(event: string, data: any, tenantId?: string): void {
  if (!io) return;
  
  const payload = {
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

// Helper to emit to specific cabang room
function emitToCabang(event: string, data: any, cabangId?: string, tenantId?: string): void {
  if (!io) return;
  
  const payload = {
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

export function emitProductCreated(product: any, tenantId?: string): void {
  emitToTenant('product:created', product, tenantId);
}

export function emitProductUpdated(product: any, tenantId?: string): void {
  emitToTenant('product:updated', product, tenantId);
}

export function emitProductDeleted(productId: string, tenantId?: string): void {
  emitToTenant('product:deleted', { id: productId }, tenantId);
}

export function emitStockUpdated(stockData: any, cabangId?: string, tenantId?: string): void {
  // Stock updates are cabang-specific
  emitToCabang('stock:updated', stockData, cabangId, tenantId);
}

export function emitTransactionCreated(transaction: any, cabangId?: string, tenantId?: string): void {
  emitToCabang('transaction:created', transaction, cabangId, tenantId);
}

export function emitSettingsUpdated(settings: any, tenantId?: string): void {
  emitToTenant('settings:updated', settings, tenantId);
}

export function emitCategoryUpdated(category: any, tenantId?: string): void {
  emitToTenant('category:updated', category, tenantId);
}
