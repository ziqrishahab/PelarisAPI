import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, type AuthUser } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rate-limit.js';
import logger, { logError } from '../lib/logger.js';
import { validate, createReturnSchema, approveReturnSchema, rejectReturnSchema } from '../lib/validators.js';
import { createAuditLog } from '../lib/audit.js';
import { ERR, MSG } from '../lib/messages.js';
import { emitStockUpdated } from '../lib/socket.js';

type Variables = {
  user: AuthUser;
};

interface ReturnItem {
  productVariantId: string;
  quantity: number;
  price: number;
}

const returns = new Hono<{ Variables: Variables }>();

// Configuration
// Lazy import to avoid circular dependency
let returnDeadlineDays: number | null = null;
async function getReturnDeadlineDays() {
  if (returnDeadlineDays === null) {
    const config = await import('../config/index.js');
    returnDeadlineDays = config.default.returns.deadlineDays;
  }
  return returnDeadlineDays;
}

// Helper: Generate unique return number with retry
async function generateReturnNumber(maxRetries = 3): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    // Get last return number for today
    const lastReturn = await prisma.return.findFirst({
      where: {
        returnNo: {
          startsWith: `RET-${dateStr}`,
        },
      },
      orderBy: {
        returnNo: 'desc',
      },
    });

    let returnNo: string;
    if (lastReturn) {
      const lastNumber = parseInt(lastReturn.returnNo.split('-').pop() || '0');
      returnNo = `RET-${dateStr}-${String(lastNumber + 1).padStart(4, '0')}`;
    } else {
      returnNo = `RET-${dateStr}-0001`;
    }

    // Try to reserve this number by checking uniqueness
    try {
      const exists = await prisma.return.findUnique({
        where: { returnNo },
      });
      
      if (!exists) {
        return returnNo;
      }
    } catch (error) {
      // Continue to next attempt
    }
  }
  
  // Fallback: add milliseconds
  const now = Date.now();
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  return `RET-${dateStr}-${String(now).slice(-4)}`;
}

// GET /api/returns/stats - Get return statistics
returns.get('/stats', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const cabangId = c.req.query('cabangId');
    
    // Multi-tenant: filter by tenant
    const where: any = {};
    if (user.tenantId) {
      where.cabang = { tenantId: user.tenantId };
    }
    if (cabangId) where.cabangId = cabangId;
    
    const [pending, rejected, completed, totalRefund] = await Promise.all([
      prisma.return.count({ where: { ...where, status: 'PENDING' } }),
      prisma.return.count({ where: { ...where, status: 'REJECTED' } }),
      prisma.return.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.return.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _sum: { refundAmount: true }
      })
    ]);
    
    return c.json({
      pending,
      rejected,
      completed,
      total: pending + rejected + completed,
      totalRefundAmount: totalRefund._sum.refundAmount || 0
    });
  } catch (error) {
    logError(error, { context: 'Fetch return stats' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// GET /api/returns - Get all returns with pagination
returns.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const cabangId = c.req.query('cabangId');
    const status = c.req.query('status');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const search = c.req.query('search');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');

    const where: any = {};
    
    // Multi-tenant: filter by tenant
    if (user.tenantId) {
      where.cabang = { tenantId: user.tenantId };
    }
    
    if (cabangId) where.cabangId = cabangId;
    if (status && status !== 'ALL') where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDateTime;
      }
    }

    // Search by return no or transaction no
    if (search) {
      where.OR = [
        { returnNo: { contains: search, mode: 'insensitive' } },
        { transaction: { transactionNo: { contains: search, mode: 'insensitive' } } }
      ];
    }

    // Pagination
    const skip = (page - 1) * limit;
    const take = limit;

    const [returnsData, total] = await Promise.all([
      prisma.return.findMany({
        where,
        skip,
        take,
        include: {
          transaction: {
            select: {
              transactionNo: true,
              customerName: true,
              customerPhone: true,
              paymentMethod: true,
              total: true,
              createdAt: true,
            },
          },
          cabang: {
            select: {
              id: true,
              name: true,
            },
          },
          processedBy: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
          items: {
            include: {
              productVariant: {
                include: {
                  product: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
          exchangeItems: {
            include: {
              productVariant: {
                include: {
                  product: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.return.count({ where })
    ]);

    return c.json({
      returns: returnsData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logError(error, { context: 'Fetch returns list' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// GET /api/returns/transaction/:transactionId/returnable - Get returnable quantities for a transaction
returns.get('/transaction/:transactionId/returnable', authMiddleware, async (c) => {
  try {
    const transactionId = c.req.param('transactionId');
    const user = c.get('user');

    // Get transaction with items
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        items: true,
        cabang: {
          select: { tenantId: true }
        }
      },
    });

    if (!transaction) {
      return c.json({ error: ERR.TRANSACTION_NOT_FOUND }, 404);
    }

    // Multi-tenant check
    if (user.tenantId && transaction.cabang?.tenantId !== user.tenantId) {
      return c.json({ error: ERR.TRANSACTION_NOT_FOUND }, 404);
    }

    // Get all previous returns for this transaction (PENDING or COMPLETED)
    const previousReturns = await prisma.returnItem.groupBy({
      by: ['productVariantId'],
      where: {
        return: {
          transactionId,
          status: {
            in: ['PENDING', 'COMPLETED'],
          },
        },
      },
      _sum: {
        quantity: true,
      },
    });

    // Build returnable quantities map
    const returnedQtyMap = new Map<string, number>();
    for (const item of previousReturns) {
      returnedQtyMap.set(item.productVariantId, item._sum.quantity || 0);
    }

    // Calculate returnable qty for each item
    const returnableItems = transaction.items.map(item => ({
      productVariantId: item.productVariantId,
      productName: item.productName,
      variantInfo: item.variantInfo,
      originalQty: item.quantity,
      returnedQty: returnedQtyMap.get(item.productVariantId) || 0,
      returnableQty: item.quantity - (returnedQtyMap.get(item.productVariantId) || 0),
      price: item.price,
    }));

    return c.json({ 
      transactionId,
      items: returnableItems,
      hasFullyReturned: returnableItems.every(item => item.returnableQty <= 0)
    });
  } catch (error) {
    logError(error, { context: 'Get returnable quantities' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// GET /api/returns/:id - Get return detail
returns.get('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    const returnData = await prisma.return.findUnique({
      where: { id },
      include: {
        transaction: {
          select: {
            transactionNo: true,
            customerName: true,
            customerPhone: true,
            paymentMethod: true,
            total: true,
          },
        },
        cabang: {
          select: {
            id: true,
            name: true,
            tenantId: true,
          },
        },
        processedBy: {
          select: {
            name: true,
            email: true,
          },
        },
        items: {
          include: {
            productVariant: {
              include: {
                product: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        exchangeItems: {
          include: {
            productVariant: {
              include: {
                product: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!returnData) {
      return c.json({ error: ERR.RETURN_NOT_FOUND }, 404);
    }

    // Multi-tenant: verify user has access to this return's tenant
    if (user.tenantId && returnData.cabang?.tenantId !== user.tenantId) {
      return c.json({ error: ERR.RETURN_NOT_FOUND }, 404);
    }

    return c.json({ return: returnData });
  } catch (error) {
    logError(error, { context: 'Fetch return detail' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// POST /api/returns - Create new return
// Rate limited: 20 returns per 15 minutes
returns.post('/', rateLimiter({ max: 20 }), authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const user = c.get('user');

    // Zod validation
    const validation = validate(createReturnSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const {
      transactionId,
      cabangId: requestCabangId,
      reason,
      notes,
      items,
      refundMethod,
      approvedBy,
      reasonDetail,
      photoUrls,
      conditionNote,
      managerOverride,
      exchangeItems,
    } = validation.data;

    // Determine if this is an exchange (WRONG_SIZE or WRONG_ITEM with exchangeItems)
    const isExchange = (reason === 'WRONG_SIZE' || reason === 'WRONG_ITEM') && exchangeItems && exchangeItems.length > 0;

    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        items: true,
      },
    });

    if (!transaction) {
      return c.json({ error: ERR.TRANSACTION_NOT_FOUND }, 404);
    }

    // Check return deadline
    const transactionDate = new Date(transaction.createdAt);
    const today = new Date();
    const daysSinceTransaction = Math.floor(
      (today.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const deadlineDays = await getReturnDeadlineDays();
    const isOverdue = daysSinceTransaction > deadlineDays;

    // If overdue without manager override, reject
    if (isOverdue && !managerOverride) {
      return c.json({
        error: `Periode return habis. Transaksi sudah ${daysSinceTransaction} hari (batas: ${deadlineDays} hari)`,
        requiresManagerOverride: true,
        daysSinceTransaction,
        deadline: deadlineDays,
      }, 400);
    }

    // Validate items and check for partial returns
    for (const item of items) {
      const transactionItem = transaction.items.find(
        (ti) => ti.productVariantId === item.productVariantId
      );
      if (!transactionItem) {
        return c.json({
          error: `Varian produk ${item.productVariantId} tidak ditemukan di transaksi`,
        }, 400);
      }

      // Check previous returns for this transaction item
      const previousReturns = await prisma.returnItem.aggregate({
        where: {
          productVariantId: item.productVariantId,
          return: {
            transactionId,
            status: {
              in: ['PENDING', 'COMPLETED'],
            },
          },
        },
        _sum: {
          quantity: true,
        },
      });

      const alreadyReturned = previousReturns._sum.quantity || 0;
      const maxReturnQty = transactionItem.quantity - alreadyReturned;

      if (item.quantity > maxReturnQty) {
        return c.json({
          error: `Tidak bisa return ${item.quantity} unit ${transactionItem.productName}. Maksimal: ${maxReturnQty} (${alreadyReturned} sudah di-return)`,
          productName: transactionItem.productName,
          requestedQty: item.quantity,
          maxReturnQty,
          alreadyReturned,
        }, 400);
      }
    }

    // Calculate total
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    
    // For exchanges, calculate the new items total and price difference
    let exchangeSubtotal = 0;
    let priceDifference = 0;
    let refundAmount = subtotal;
    const exchangeItemsData: Array<{
      productVariantId: string;
      productName: string;
      variantInfo: string;
      quantity: number;
      price: number;
      subtotal: number;
    }> = [];

    if (isExchange && exchangeItems) {
      // Fetch exchange item details
      for (const exItem of exchangeItems) {
        const variant = await prisma.productVariant.findUnique({
          where: { id: exItem.productVariantId },
          include: {
            product: true,
            stocks: {
              where: { cabangId: transaction.cabangId! },
              take: 1,
            },
          },
        });

        if (!variant) {
          return c.json({ error: `Varian tukar ${exItem.productVariantId} tidak ditemukan` }, 400);
        }

        const price = variant.stocks[0]?.price || 0;
        const itemSubtotal = price * exItem.quantity;
        exchangeSubtotal += itemSubtotal;

        exchangeItemsData.push({
          productVariantId: variant.id,
          productName: variant.product.name,
          variantInfo: variant.variantValue,
          quantity: exItem.quantity,
          price,
          subtotal: itemSubtotal,
        });
      }

      // Price difference: positive = customer pays more, negative = customer gets refund
      priceDifference = exchangeSubtotal - subtotal;
      refundAmount = priceDifference < 0 ? Math.abs(priceDifference) : 0; // Only refund if new items are cheaper
    }

    // Generate return number with retry mechanism
    const returnNo = await generateReturnNumber();

    // Create return with cash transaction
    const returnData = await prisma.$transaction(async (tx) => {
      // Use cabangId from request, user, or transaction (in that order of priority)
      const returnCabangId = requestCabangId || user.cabangId || transaction.cabangId;
      
      if (!returnCabangId) {
        throw new Error('Cannot determine cabang for return. Please provide cabangId.');
      }
      
      const newReturn = await tx.return.create({
        data: {
          returnNo,
          transactionId,
          cabangId: returnCabangId,
          processedById: user.userId,
          reason: reason as any,
          reasonDetail,
          notes,
          photoUrls: photoUrls || [],
          conditionNote,
          subtotal,
          refundMethod: (refundMethod || transaction.paymentMethod || 'CASH') as any,
          refundAmount,
          status: approvedBy ? 'COMPLETED' : 'PENDING',
          approvedBy,
          approvedAt: approvedBy ? new Date() : null,
          isOverdue,
          managerOverride: managerOverride || false,
          returnType: isExchange ? 'EXCHANGE' : 'REFUND',
          priceDifference: isExchange ? priceDifference : null,
          items: {
            create: await Promise.all(
              items.map(async (item) => {
                const transactionItem = transaction.items.find(
                  (ti) => ti.productVariantId === item.productVariantId
                );
                return {
                  productVariantId: item.productVariantId,
                  productName: transactionItem!.productName,
                  variantInfo: transactionItem!.variantInfo,
                  sku: transactionItem!.sku,
                  quantity: item.quantity,
                  price: item.price,
                  subtotal: item.price * item.quantity,
                };
              })
            ),
          },
          // Create exchange items if this is an exchange
          ...(isExchange && exchangeItemsData.length > 0 ? {
            exchangeItems: {
              create: exchangeItemsData,
            },
          } : {}),
        },
        include: {
          items: true,
          exchangeItems: true,
        },
      });

      // If approved, update stock and create cash transaction
      if (approvedBy && user.cabangId) {
        for (const item of items) {
          await tx.stock.update({
            where: {
              productVariantId_cabangId: {
                productVariantId: item.productVariantId,
                cabangId: user.cabangId,
              },
            },
            data: {
              quantity: {
                increment: item.quantity,
              },
            },
          });
        }

        // Create cash transaction for refund tracking
        await tx.cashTransaction.create({
          data: {
            type: 'RETURN',
            amount: -refundAmount, // Negative = money out
            description: `Refund for ${returnNo} - ${reason}`,
            cabangId: user.cabangId,
            returnId: newReturn.id,
            transactionId,
            recordedById: user.userId,
          },
        });

        // Update return status to COMPLETED
        await tx.return.update({
          where: { id: newReturn.id },
          data: { status: 'COMPLETED' },
        });
      }

      return newReturn;
    });

    logger.info('Return created', {
      returnNo: returnData.returnNo,
      transactionId,
      refundAmount,
      status: returnData.status,
      isOverdue,
      managerOverride: managerOverride || false,
    });

    // Audit log (non-blocking)
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      c.req.header('cf-connecting-ip') ||
      undefined;

    void createAuditLog({
      action: approvedBy ? 'RETURN_CREATED_AND_APPROVED' : 'RETURN_CREATED',
      entityType: 'Return',
      entityId: returnData.id,
      description: `Return ${returnNo} created for transaction ${transaction.transactionNo}`,
      metadata: {
        transactionId,
        cabangId: user.cabangId || transaction.cabangId,
        subtotal,
        refundAmount,
        reason,
        status: returnData.status,
        isExchange,
      },
      context: { user, ip },
    });

    return c.json({ return: returnData }, 201);
  } catch (error) {
    logError(error, { context: 'Create return' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// PATCH /api/returns/:id/approve - Approve return
returns.patch('/:id/approve', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    
    // Zod validation
    const validation = validate(approveReturnSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const { approvedBy } = validation.data;
    const user = c.get('user');

    const returnData = await prisma.return.findUnique({
      where: { id },
      include: {
        items: true,
        exchangeItems: true, // Include exchange items
        transaction: true,
      },
    });

    if (!returnData) {
      return c.json({ error: ERR.RETURN_NOT_FOUND }, 404);
    }

    if (returnData.status !== 'PENDING') {
      return c.json({ error: 'Return sudah diproses sebelumnya' }, 400);
    }

    const isExchange = returnData.returnType === 'EXCHANGE';
    
    // Check if this is a write-off reason (DAMAGED/DEFECTIVE/EXPIRED - barang rusak tidak masuk stok)
    const isWriteOff = returnData.reason === 'DAMAGED' || returnData.reason === 'DEFECTIVE' || returnData.reason === 'EXPIRED';

    // Approve and update stock
    const updatedReturn = await prisma.$transaction(async (tx) => {
      // 1. Return old items to stock - ONLY if not write-off
      if (!isWriteOff) {
        for (const item of returnData.items) {
          await tx.stock.update({
            where: {
              productVariantId_cabangId: {
                productVariantId: item.productVariantId,
                cabangId: returnData.cabangId,
              },
            },
            data: {
              quantity: {
                increment: item.quantity,
              },
            },
          });
        }
      } else {
        // For write-off: Create StockAdjustment records for DAMAGED items
        for (const item of returnData.items) {
          const currentStock = await tx.stock.findUnique({
            where: {
              productVariantId_cabangId: {
                productVariantId: item.productVariantId,
                cabangId: returnData.cabangId,
              },
            },
          });

          if (currentStock) {
            await tx.stockAdjustment.create({
              data: {
                productVariantId: item.productVariantId,
                stockId: currentStock.id,
                cabangId: returnData.cabangId,
                adjustedById: user.userId, // Use approving user, not processedById (which is null for PENDING)
                previousQty: currentStock.quantity,
                newQty: currentStock.quantity, // Quantity stays same (not returning)
                difference: -item.quantity, // Negative = write-off
                reason: 'DAMAGED',
                notes: `Write-off dari return ${returnData.returnNo}: ${returnData.reason === 'EXPIRED' ? 'Barang Kadaluarsa' : returnData.reason === 'DEFECTIVE' ? 'Barang Cacat' : 'Barang Rusak'}`,
              },
            });
          }
        }
        
        logger.info('Write-off items recorded as DAMAGED in StockAdjustment', {
          returnNo: returnData.returnNo,
          reason: returnData.reason,
          items: returnData.items.map(i => ({ 
            productName: i.productName, 
            variantInfo: i.variantInfo, 
            quantity: i.quantity 
          })),
        });
      }

      // 2. For EXCHANGE: Deduct exchange items from stock (decrement)
      if (isExchange && returnData.exchangeItems.length > 0) {
        for (const exItem of returnData.exchangeItems) {
          // Check stock availability first
          const currentStock = await tx.stock.findUnique({
            where: {
              productVariantId_cabangId: {
                productVariantId: exItem.productVariantId,
                cabangId: returnData.cabangId,
              },
            },
          });

          if (!currentStock || currentStock.quantity < exItem.quantity) {
            throw new Error(`Stok tidak cukup untuk ${exItem.productName} - ${exItem.variantInfo}. Tersedia: ${currentStock?.quantity || 0}, Dibutuhkan: ${exItem.quantity}`);
          }

          await tx.stock.update({
            where: {
              productVariantId_cabangId: {
                productVariantId: exItem.productVariantId,
                cabangId: returnData.cabangId,
              },
            },
            data: {
              quantity: {
                decrement: exItem.quantity,
              },
            },
          });
        }
      }

      // 3. Handle cash transaction based on type
      if (isExchange) {
        // For exchange: only create cash transaction if there's a price difference
        const priceDiff = returnData.priceDifference || 0;
        if (priceDiff !== 0) {
          await tx.cashTransaction.create({
            data: {
              type: priceDiff > 0 ? 'SALE' : 'RETURN', // Customer pays more (SALE) or gets refund (RETURN)
              amount: priceDiff, // Positive = customer pays, Negative = refund
              description: priceDiff > 0 
                ? `Exchange price difference (customer pays Rp ${Math.abs(priceDiff).toLocaleString()}) for ${returnData.returnNo}`
                : `Exchange price difference (refund Rp ${Math.abs(priceDiff).toLocaleString()}) for ${returnData.returnNo}`,
              cabangId: returnData.cabangId,
              returnId: returnData.id,
              transactionId: returnData.transactionId,
              recordedById: user.userId,
            },
          });
        }
      } else {
        // For regular REFUND: create refund cash transaction
        await tx.cashTransaction.create({
          data: {
            type: 'RETURN',
            amount: -returnData.refundAmount, // Negative = money out
            description: `Refund approved for ${returnData.returnNo}`,
            cabangId: returnData.cabangId,
            returnId: returnData.id,
            transactionId: returnData.transactionId,
            recordedById: user.userId,
          },
        });
      }

      // Update return status
      return await tx.return.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          approvedBy,
          approvedAt: new Date(),
        },
        include: {
          items: true,
          exchangeItems: true,
        },
      });
    });

    logger.info('Return approved', {
      returnId: id,
      returnNo: returnData.returnNo,
      returnType: returnData.returnType,
      refundAmount: returnData.refundAmount,
      priceDifference: returnData.priceDifference,
    });

    // Emit stock update event for real-time UI updates
    emitStockUpdated({
      cabangId: returnData.cabangId,
      action: isWriteOff ? 'write_off' : 'return_approved',
      returnNo: returnData.returnNo,
      quantity: 0, // Placeholder - actual stock changes already applied in transaction
    });

    return c.json({ return: updatedReturn });
  } catch (error: any) {
    logError(error, { context: 'Approve return' });
    // Return specific error message if it's a stock issue
    if (error.message?.includes('Stok tidak cukup')) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// PATCH /api/returns/:id/reject - Reject return
returns.patch('/:id/reject', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    
    // Zod validation
    const validation = validate(rejectReturnSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const { rejectedBy, rejectionNotes } = validation.data;

    const returnData = await prisma.return.findUnique({
      where: { id },
    });

    if (!returnData) {
      return c.json({ error: ERR.RETURN_NOT_FOUND }, 404);
    }

    if (returnData.status !== 'PENDING') {
      return c.json({ error: 'Return sudah diproses sebelumnya' }, 400);
    }

    const updatedReturn = await prisma.return.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy: rejectedBy,
        approvedAt: new Date(),
        notes: rejectionNotes || returnData.notes,
      },
    });

    return c.json({ return: updatedReturn });
  } catch (error) {
    logError(error, { context: 'Reject return' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// GET /api/returns/analytics/products - Return rate by product
returns.get('/analytics/products', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const cabangId = c.req.query('cabangId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    // Build return filter
    const returnWhere: any = { status: 'COMPLETED' };
    
    // Multi-tenant: filter by tenant
    if (user.tenantId) {
      returnWhere.cabang = { tenantId: user.tenantId };
    }
    
    if (cabangId) returnWhere.cabangId = cabangId;
    if (startDate || endDate) {
      returnWhere.createdAt = {};
      if (startDate) returnWhere.createdAt.gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        returnWhere.createdAt.lte = endDateTime;
      }
    }

    // Get return items
    const returnItems = await prisma.returnItem.findMany({
      where: {
        return: returnWhere,
      },
      include: {
        productVariant: {
          include: {
            product: true,
          },
        },
      },
    });

    // Aggregate by product
    const productStats = new Map<string, { name: string; totalReturns: number; totalQty: number }>();
    
    for (const item of returnItems) {
      const productId = item.productVariant.product.id;
      const productName = item.productVariant.product.name;
      
      if (!productStats.has(productId)) {
        productStats.set(productId, { name: productName, totalReturns: 0, totalQty: 0 });
      }
      
      const stats = productStats.get(productId)!;
      stats.totalReturns += 1;
      stats.totalQty += item.quantity;
    }

    const products = Array.from(productStats.entries()).map(([id, stats]) => ({
      productId: id,
      productName: stats.name,
      totalReturns: stats.totalReturns,
      totalQuantity: stats.totalQty,
    })).sort((a, b) => b.totalReturns - a.totalReturns);

    return c.json({ products });
  } catch (error) {
    logError(error, { context: 'Fetch return analytics by products' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// GET /api/returns/analytics/reasons - Return reasons distribution
returns.get('/analytics/reasons', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const cabangId = c.req.query('cabangId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const where: any = { status: 'COMPLETED' };
    
    // Multi-tenant: filter by tenant
    if (user.tenantId) {
      where.cabang = { tenantId: user.tenantId };
    }
    
    if (cabangId) where.cabangId = cabangId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDateTime;
      }
    }

    const reasons = await prisma.return.groupBy({
      by: ['reason'],
      where,
      _count: {
        id: true,
      },
      _sum: {
        refundAmount: true,
      },
    });

    const total = reasons.reduce((sum, r) => sum + r._count.id, 0);
    
    const distribution = reasons.map((r) => ({
      reason: r.reason,
      count: r._count.id,
      percentage: total > 0 ? Math.round((r._count.id / total) * 100) : 0,
      totalAmount: r._sum.refundAmount || 0,
    })).sort((a, b) => b.count - a.count);

    return c.json({ reasons: distribution, total });
  } catch (error) {
    logError(error, { context: 'Fetch return reasons analytics' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// GET /api/returns/analytics/trend - Return trend over time
returns.get('/analytics/trend', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const cabangId = c.req.query('cabangId');
    const period = c.req.query('period') || 'monthly'; // daily, weekly, monthly
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const where: any = { status: 'COMPLETED' };
    
    // Multi-tenant: filter by tenant
    if (user.tenantId) {
      where.cabang = { tenantId: user.tenantId };
    }
    
    if (cabangId) where.cabangId = cabangId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDateTime;
      }
    }

    const returns = await prisma.return.findMany({
      where,
      select: {
        createdAt: true,
        refundAmount: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group by period
    const trendData = new Map<string, { count: number; amount: number }>();
    
    for (const ret of returns) {
      let key: string;
      const date = new Date(ret.createdAt);
      
      if (period === 'daily') {
        key = date.toISOString().split('T')[0];
      } else if (period === 'weekly') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        // monthly
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      
      if (!trendData.has(key)) {
        trendData.set(key, { count: 0, amount: 0 });
      }
      
      const stats = trendData.get(key)!;
      stats.count += 1;
      stats.amount += ret.refundAmount;
    }

    const trend = Array.from(trendData.entries())
      .map(([period, stats]) => ({
        period,
        count: stats.count,
        amount: stats.amount,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return c.json({ trend, period });
  } catch (error) {
    logError(error, { context: 'Fetch return trend analytics' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

export default returns;
