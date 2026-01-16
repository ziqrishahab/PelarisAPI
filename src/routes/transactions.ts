import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOrManager, type AuthUser } from '../middleware/auth.js';
import { rateLimiter, strictRateLimiter } from '../middleware/rate-limit.js';
import { emitStockUpdated } from '../lib/socket.js';
import logger, { logTransaction, logError } from '../lib/logger.js';
import { createTransactionSchema, validate } from '../lib/validators.js';
import { ERR, MSG } from '../lib/messages.js';

type Variables = {
  user: AuthUser;
};

interface TransactionItem {
  productVariantId: string;
  quantity: number;
  price: number;
}

interface TransactionBody {
  customerName?: string;
  customerPhone?: string;
  items: TransactionItem[];
  discount?: number;
  tax?: number;
  paymentMethod: string;
  bankName?: string;
  referenceNo?: string;
  cardLastDigits?: string;
  isSplitPayment?: boolean;
  paymentAmount1?: number;
  paymentMethod2?: string;
  paymentAmount2?: number;
  bankName2?: string;
  referenceNo2?: string;
  notes?: string;
  cabangId?: string;
}

// Generate transaction number (INV-YYYYMMDD-XXXX)
function generateTransactionNo(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `INV-${year}${month}${day}-${random}`;
}

const transactions = new Hono<{ Variables: Variables }>();

// Create new transaction (POS)
// Rate limited: 100 transactions per 5 minutes (high volume for POS)
transactions.post('/', rateLimiter({ max: 100, windowMs: 5 * 60 * 1000 }), authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    
    // Validate input with Zod
    const validation = validate(createTransactionSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const { 
      customerName, 
      customerPhone, 
      items,
      discount = 0, 
      tax = 0, 
      paymentMethod,
      bankName,
      referenceNo,
      cardLastDigits,
      isSplitPayment = false,
      paymentAmount1,
      paymentMethod2,
      paymentAmount2,
      bankName2,
      referenceNo2,
      notes,
      cabangId: bodyCabangId
    } = validation.data;

    // Get cabangId from authenticated user's token or from body (for Owner/Manager)
    const cabangId = user.cabangId || bodyCabangId;

    // Validation
    if (!cabangId) {
      return c.json({ 
        error: ERR.CABANG_ID_REQUIRED 
      }, 400);
    }

    // Calculate totals and validate stock
    let subtotal = 0;
    const itemsWithDetails: any[] = [];

    for (const item of items) {
      const { productVariantId, quantity, price } = item;

      if (!productVariantId || !quantity || !price) {
        return c.json({ 
          error: ERR.REQUIRED_FIELDS 
        }, 400);
      }

      // Get product variant with stock
      const variant = await prisma.productVariant.findUnique({
        where: { id: productVariantId },
        include: {
          product: true,
          stocks: {
            where: { cabangId }
          }
        }
      });

      if (!variant) {
        return c.json({ 
          error: `Varian produk ${productVariantId} tidak ditemukan` 
        }, 404);
      }

      // Check stock availability
      const stock = variant.stocks[0];
      if (!stock || stock.quantity < quantity) {
        return c.json({ 
          error: `Stok tidak mencukupi untuk ${variant.product.name} (${variant.variantName}: ${variant.variantValue})` 
        }, 400);
      }

      const itemSubtotal = price * quantity;
      subtotal += itemSubtotal;

      // Hide default variant info for cleaner display
      let variantInfo = `${variant.variantName}: ${variant.variantValue}`;
      const defaultVariants = ['default', 'standar', 'standard'];
      const isDefaultVariant = defaultVariants.some(v => 
        variant.variantName.toLowerCase().includes(v) || 
        variant.variantValue.toLowerCase().includes(v)
      );
      if (isDefaultVariant) {
        variantInfo = '';
      }

      itemsWithDetails.push({
        productVariantId,
        productName: variant.product.name,
        variantInfo,
        quantity,
        price,
        subtotal: itemSubtotal,
        stockId: stock.id,
        currentStock: stock.quantity
      });
    }

    const total = subtotal - discount + tax;

    // Validate split payment amounts match total
    if (isSplitPayment && paymentAmount1 && paymentAmount2) {
      const sumPayments = paymentAmount1 + paymentAmount2;
      if (Math.abs(sumPayments - total) > 0.01) {
        return c.json({ 
          error: `Total split payment (${sumPayments}) harus sama dengan total transaksi (${total})` 
        }, 400);
      }
    }

    // Get default POS channel
    const posChannel = await prisma.salesChannel.findFirst({
      where: { code: 'POS', isBuiltIn: true }
    });

    // Create transaction with items and update stock in a transaction
    const transaction = await prisma.$transaction(async (tx) => {
      // Create transaction
      const newTransaction = await tx.transaction.create({
        data: {
          transactionNo: generateTransactionNo(),
          channelId: posChannel?.id || null,
          status: 'COMPLETED',
          cabangId,
          kasirId: user.userId,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          subtotal,
          discount,
          tax,
          total,
          paymentMethod: paymentMethod as any,
          paymentStatus: 'COMPLETED',
          bankName: bankName || null,
          referenceNo: referenceNo || null,
          cardLastDigits: cardLastDigits || null,
          isSplitPayment: isSplitPayment || false,
          paymentAmount1: isSplitPayment ? paymentAmount1 : null,
          paymentMethod2: isSplitPayment ? (paymentMethod2 as any) : null,
          paymentAmount2: isSplitPayment ? paymentAmount2 : null,
          bankName2: isSplitPayment ? (bankName2 || null) : null,
          referenceNo2: isSplitPayment ? (referenceNo2 || null) : null,
          notes: notes || null,
          items: {
            create: itemsWithDetails.map(item => ({
              productVariantId: item.productVariantId,
              productName: item.productName,
              variantInfo: item.variantInfo,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.subtotal
            }))
          }
        },
        include: {
          items: {
            include: {
              productVariant: {
                include: {
                  product: true
                }
              }
            }
          },
          cabang: true,
          kasir: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      // Update stock for each item
      for (const item of itemsWithDetails) {
        await tx.stock.update({
          where: { id: item.stockId },
          data: {
            quantity: item.currentStock - item.quantity
          }
        });
      }

      return { newTransaction, stockUpdates: itemsWithDetails };
    });

    // Emit stock updates via WebSocket
    for (const item of transaction.stockUpdates) {
      emitStockUpdated({
        productVariantId: item.productVariantId,
        cabangId,
        quantity: item.currentStock - item.quantity,
        previousQuantity: item.currentStock,
        operation: 'subtract'
      });
    }

    // Log transaction
    logTransaction(
      'created',
      transaction.newTransaction.transactionNo,
      transaction.newTransaction.total,
      user.userId,
      cabangId
    );

    return c.json({
      message: MSG.TRANSACTION_CREATED,
      transaction: transaction.newTransaction
    }, 201);

  } catch (error) {
    logError(error, { context: 'Create transaction' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Get all transactions with filters
transactions.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const cabangId = c.req.query('cabangId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const paymentMethod = c.req.query('paymentMethod');
    const channelId = c.req.query('channelId');
    const status = c.req.query('status');
    const search = c.req.query('search');

    const where: any = {};
    
    // Filter by cabang (kasir can only see their branch)
    if (user.role === 'KASIR' && user.cabangId) {
      where.cabangId = user.cabangId;
    } else if (cabangId) {
      where.cabangId = cabangId;
    }

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    if (channelId) {
      where.channelId = channelId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { transactionNo: { contains: search, mode: 'insensitive' } },
        { externalOrderId: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { buyerUsername: { contains: search, mode: 'insensitive' } }
      ];
    }

    const transactionList = await prisma.transaction.findMany({
      where,
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: true
              }
            }
          }
        },
        cabang: true,
        kasir: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        channel: true,
        returns: {
          select: {
            id: true,
            returnNo: true,
            status: true,
            refundAmount: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    // Add returnStatus helper field
    const transactionsWithReturnStatus = transactionList.map(t => ({
      ...t,
      returnStatus: t.returns[0]?.status || null,
      hasReturn: t.returns.length > 0
    }));

    return c.json(transactionsWithReturnStatus);
  } catch (error) {
    logError(error, { context: 'Get transactions' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Get sales summary (Owner/Manager only)
transactions.get('/reports/summary', authMiddleware, ownerOrManager, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const where: any = {};
    if (cabangId) where.cabangId = cabangId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [totalTransactions, totalRevenue, paymentMethodBreakdown] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.aggregate({
        where,
        _sum: { total: true }
      }),
      prisma.transaction.groupBy({
        by: ['paymentMethod'],
        where,
        _count: { id: true },
        _sum: { total: true }
      })
    ]);

    return c.json({
      totalTransactions,
      totalRevenue: totalRevenue._sum.total || 0,
      paymentMethodBreakdown
    });
  } catch (error) {
    logError(error, { context: 'Get sales summary' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Get sales trend (daily for last 7 days or last 30 days)
transactions.get('/reports/sales-trend', authMiddleware, ownerOrManager, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    const days = parseInt(c.req.query('days') || '7');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const where: any = {
      createdAt: { gte: startDate }
    };
    if (cabangId) where.cabangId = cabangId;

    const transactionList = await prisma.transaction.findMany({
      where,
      select: {
        createdAt: true,
        total: true
      }
    });

    // Group by date
    const salesByDate: Record<string, { date: string; total: number; count: number }> = {};
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      salesByDate[dateKey] = { date: dateKey, total: 0, count: 0 };
    }

    transactionList.forEach(t => {
      const dateKey = t.createdAt.toISOString().split('T')[0];
      if (salesByDate[dateKey]) {
        salesByDate[dateKey].total += Number(t.total);
        salesByDate[dateKey].count += 1;
      }
    });

    const trend = Object.values(salesByDate).reverse();

    return c.json({ trend });
  } catch (error) {
    logError(error, { context: 'Get sales trend' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Get top selling products
transactions.get('/reports/top-products', authMiddleware, ownerOrManager, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    const limit = parseInt(c.req.query('limit') || '10');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const where: any = {};
    if (cabangId) where.transaction = { cabangId };
    if (startDate || endDate) {
      where.transaction = { ...where.transaction, createdAt: {} };
      if (startDate) where.transaction.createdAt.gte = new Date(startDate);
      if (endDate) where.transaction.createdAt.lte = new Date(endDate);
    }

    const topProducts = await prisma.transactionItem.groupBy({
      by: ['productVariantId'],
      where,
      _sum: {
        quantity: true,
        subtotal: true
      },
      _count: {
        id: true
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: limit
    });

    // Get product details
    const productsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        const variant = await prisma.productVariant.findUnique({
          where: { id: item.productVariantId },
          include: {
            product: {
              select: {
                name: true,
                category: { select: { name: true } }
              }
            }
          }
        });

        return {
          productVariantId: item.productVariantId,
          productName: variant?.product.name || 'Unknown',
          variantName: variant?.variantName || '-',
          variantValue: variant?.variantValue || '-',
          category: variant?.product.category?.name || '-',
          totalQuantity: item._sum.quantity,
          totalRevenue: item._sum.subtotal,
          transactionCount: item._count.id
        };
      })
    );

    return c.json({ topProducts: productsWithDetails });
  } catch (error) {
    logError(error, { context: 'Get top products' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Get branch performance comparison
transactions.get('/reports/branch-performance', authMiddleware, ownerOrManager, async (c) => {
  try {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const branchStats = await prisma.transaction.groupBy({
      by: ['cabangId'],
      where,
      _count: { id: true },
      _sum: { total: true },
      _avg: { total: true }
    });

    // Get cabang details
    const branchPerformance = await Promise.all(
      branchStats.map(async (stat) => {
        const cabang = await prisma.cabang.findUnique({
          where: { id: stat.cabangId }
        });

        return {
          cabangId: stat.cabangId,
          cabangName: cabang?.name || 'Unknown',
          totalTransactions: stat._count.id,
          totalRevenue: stat._sum.total || 0,
          avgTransactionValue: Math.round(Number(stat._avg.total) || 0)
        };
      })
    );

    // Sort by revenue
    branchPerformance.sort((a, b) => Number(b.totalRevenue) - Number(a.totalRevenue));

    return c.json({ branchPerformance });
  } catch (error) {
    logError(error, { context: 'Get branch performance' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Get time statistics (busiest hours/days)
transactions.get('/reports/time-stats', authMiddleware, ownerOrManager, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const where: any = {};
    if (cabangId) where.cabangId = cabangId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const transactionList = await prisma.transaction.findMany({
      where,
      select: {
        createdAt: true,
        total: true
      }
    });

    // Group by hour (0-23)
    const hourlyStats = Array(24).fill(0).map((_, i) => ({ hour: i, count: 0, total: 0 }));
    
    // Group by day of week (0=Sunday, 6=Saturday)
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const dailyStats = Array(7).fill(0).map((_, i) => ({ 
      day: dayNames[i], 
      dayIndex: i, 
      count: 0, 
      total: 0 
    }));

    transactionList.forEach(t => {
      const hour = t.createdAt.getHours();
      const day = t.createdAt.getDay();
      
      hourlyStats[hour].count += 1;
      hourlyStats[hour].total += Number(t.total);
      
      dailyStats[day].count += 1;
      dailyStats[day].total += Number(t.total);
    });

    // Find busiest hour and day
    const busiestHour = hourlyStats.reduce((max, curr) => 
      curr.count > max.count ? curr : max
    );
    
    const busiestDay = dailyStats.reduce((max, curr) => 
      curr.count > max.count ? curr : max
    );

    return c.json({ 
      hourlyStats: hourlyStats.filter(h => h.count > 0),
      dailyStats,
      busiestHour: {
        hour: busiestHour.hour,
        count: busiestHour.count,
        total: busiestHour.total
      },
      busiestDay: {
        day: busiestDay.day,
        count: busiestDay.count,
        total: busiestDay.total
      }
    });
  } catch (error) {
    logError(error, { context: 'Get time stats' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Get single transaction by ID
transactions.get('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: true
              }
            }
          }
        },
        cabang: true,
        kasir: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!transaction) {
      return c.json({ error: ERR.TRANSACTION_NOT_FOUND }, 404);
    }

    // Kasir can only see transactions from their branch
    if (user.role === 'KASIR' && transaction.cabangId !== user.cabangId) {
      return c.json({ error: ERR.FORBIDDEN }, 403);
    }

    return c.json(transaction);
  } catch (error) {
    logError(error, { context: 'Get transaction by ID' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Cancel transaction (Owner only - for mistakes)
// Rate limited: 10 cancellations per 15 minutes
transactions.put('/:id/cancel', rateLimiter({ max: 10 }), authMiddleware, ownerOrManager, async (c) => {
  try {
    const transactionId = c.req.param('id');

    // Get transaction with items
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { items: true }
    });

    if (!transaction) {
      return c.json({ error: ERR.TRANSACTION_NOT_FOUND }, 404);
    }

    if (transaction.paymentStatus === 'CANCELLED') {
      return c.json({ error: 'Transaksi sudah dibatalkan sebelumnya' }, 400);
    }

    // Update transaction and restore stock in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Update transaction status
      const updatedTransaction = await tx.transaction.update({
        where: { id: transactionId },
        data: { paymentStatus: 'CANCELLED' }
      });

      // Restore stock for each item
      const stockUpdates: any[] = [];
      for (const item of transaction.items) {
        const stock = await tx.stock.findUnique({
          where: {
            productVariantId_cabangId: {
              productVariantId: item.productVariantId,
              cabangId: transaction.cabangId
            }
          }
        });

        if (stock) {
          const newQuantity = stock.quantity + item.quantity;
          await tx.stock.update({
            where: { id: stock.id },
            data: {
              quantity: newQuantity
            }
          });
          stockUpdates.push({
            productVariantId: item.productVariantId,
            cabangId: transaction.cabangId,
            quantity: newQuantity,
            previousQuantity: stock.quantity
          });
        }
      }

      return { updatedTransaction, stockUpdates };
    });

    // Emit stock updates via WebSocket
    for (const stockUpdate of updated.stockUpdates) {
      emitStockUpdated({
        ...stockUpdate,
        operation: 'add'
      });
    }

    return c.json({
      message: MSG.TRANSACTION_CANCELLED,
      transaction: updated.updatedTransaction
    });
  } catch (error) {
    logError(error, { context: 'Cancel transaction' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

export default transactions;
