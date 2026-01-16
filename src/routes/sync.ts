import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { strictRateLimiter } from '../middleware/rate-limit.js';
import { logError } from '../lib/logger.js';
import { validate, batchTransactionSyncSchema, deltaSyncSchema } from '../lib/validators.js';
import { ERR, MSG } from '../lib/messages.js';

const sync = new Hono();

// Health check endpoint
sync.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'AnekaBuana API'
  });
});

// Delta sync - Get products updated after timestamp
sync.get('/products/delta', authMiddleware, async (c) => {
  try {
    const updatedAfter = c.req.query('updatedAfter');

    // Validate query param
    const validation = validate(deltaSyncSchema, { updatedAfter });
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const validatedData = validation.data as { updatedAfter: string };

    const products = await prisma.product.findMany({
      where: {
        updatedAt: {
          gt: new Date(validatedData.updatedAfter)
        }
      },
      include: {
        category: true,
        variants: {
          include: {
            stocks: {
              include: {
                cabang: true
              }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Get unique categories from products
    const categoryIds = [...new Set(products.map(p => p.categoryId).filter(Boolean))] as string[];
    const categories = await prisma.category.findMany({
      where: {
        id: {
          in: categoryIds
        }
      }
    });

    return c.json({
      count: products.length,
      products,
      categories,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    logError(error, { context: 'Delta sync' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Batch transaction sync - Accept multiple transactions at once
// Rate limited: 10 batch syncs per 15 minutes (heavy operation)
sync.post('/transactions/batch', strictRateLimiter({ max: 10 }), authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    
    // Zod validation
    const validation = validate(batchTransactionSyncSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const validatedBody = validation.data as { transactions: Array<{
      id?: string;
      transactionNo?: string;
      cabangId: string;
      kasirId?: string;
      kasirName?: string;
      customerName?: string;
      customerPhone?: string;
      items: Array<{
        productVariantId: string;
        productName: string;
        variantInfo?: string;
        sku?: string;
        quantity: number;
        price: number;
      }>;
      discount?: number;
      paymentMethod: 'CASH' | 'DEBIT' | 'TRANSFER' | 'QRIS';
      bankName?: string;
      referenceNo?: string;
      isSplitPayment?: boolean;
      paymentAmount1?: number;
      paymentMethod2?: 'CASH' | 'DEBIT' | 'TRANSFER' | 'QRIS';
      paymentAmount2?: number;
      bankName2?: string;
      referenceNo2?: string;
      notes?: string;
      createdAt?: string;
    }> };
    const { transactions } = validatedBody;

    const results: Array<{ localId: string; serverId: string; status: string }> = [];
    const errors: Array<{ transaction: unknown; error: string }> = [];
    const user = c.get('user');

    // Process each transaction
    for (const txData of transactions) {
      try {
        const {
          cabangId,
          kasirId,
          kasirName,
          customerName,
          customerPhone,
          items,
          discount,
          paymentMethod,
          bankName,
          referenceNo,
          // Split Payment
          isSplitPayment,
          paymentAmount1,
          paymentMethod2,
          paymentAmount2,
          bankName2,
          referenceNo2,
          notes,
          createdAt
        } = txData;

        if (!cabangId || !items || items.length === 0 || !paymentMethod) {
          errors.push({
            transaction: txData,
            error: ERR.REQUIRED_FIELDS
          });
          continue;
        }

        // Create transaction with offline timestamp
        const transaction = await prisma.$transaction(async (tx) => {
          // Calculate totals
          let subtotal = 0;
          for (const item of items) {
            subtotal += item.price * item.quantity;
          }
          const total = subtotal - (discount || 0);

          // Check if transaction already exists (by ID or transactionNo)
          const existingTransaction = await tx.transaction.findFirst({
            where: {
              OR: [
                { id: txData.id },
                { transactionNo: txData.transactionNo }
              ]
            }
          });

          // If transaction already exists, skip creation and return existing
          if (existingTransaction) {
            return existingTransaction;
          }

          // Create transaction (use offline createdAt if provided, use kasirId from request)
          const newTransaction = await tx.transaction.create({
            data: {
              id: txData.id, // Preserve offline ID
              transactionNo: txData.transactionNo || `INV-${Date.now()}`,
              cabangId,
              kasirId: kasirId || user.userId, // Use kasirId from offline transaction, fallback to user.userId
              customerName,
              customerPhone,
              subtotal,
              discount: discount || 0,
              tax: 0,
              total,
              paymentMethod,
              paymentStatus: 'COMPLETED',
              bankName,
              referenceNo,
              // Split Payment
              isSplitPayment: isSplitPayment || false,
              paymentAmount1: isSplitPayment ? paymentAmount1 : null,
              paymentMethod2: isSplitPayment ? paymentMethod2 : null,
              paymentAmount2: isSplitPayment ? paymentAmount2 : null,
              bankName2: isSplitPayment ? (bankName2 || null) : null,
              referenceNo2: isSplitPayment ? (referenceNo2 || null) : null,
              notes,
              createdAt: createdAt ? new Date(createdAt) : undefined // Honor offline timestamp
            }
          });

          // Create transaction items and update stock
          for (const item of items) {
            await tx.transactionItem.create({
              data: {
                transactionId: newTransaction.id,
                productVariantId: item.productVariantId,
                productName: item.productName,
                variantInfo: item.variantInfo || '',
                sku: item.sku,
                quantity: item.quantity,
                price: item.price,
                subtotal: item.price * item.quantity
              }
            });

            // Deduct stock
            const stock = await tx.stock.findUnique({
              where: {
                productVariantId_cabangId: {
                  productVariantId: item.productVariantId,
                  cabangId
                }
              }
            });

            if (stock) {
              await tx.stock.update({
                where: {
                  productVariantId_cabangId: {
                    productVariantId: item.productVariantId,
                    cabangId
                  }
                },
                data: {
                  quantity: {
                    decrement: item.quantity
                  }
                }
              });
            }
          }

          return newTransaction;
        });

        results.push({
          localId: txData.id || transaction.id,
          serverId: transaction.id,
          status: 'success'
        });

      } catch (error) {
        logError(error, { context: 'Batch transaction item' });
        errors.push({
          transaction: txData,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return c.json({
      success: results.length,
      failed: errors.length,
      results,
      errors
    });

  } catch (error) {
    logError(error, { context: 'Batch transaction' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

export default sync;
