/**
 * Products Routes
 * 
 * Handles CRUD operations for products.
 * Categories routes have been extracted to categories.ts
 * Import/Export routes have been extracted to products-import-export.ts
 */

import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOrManager, type AuthUser } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rate-limit.js';
import { emitProductCreated, emitProductUpdated, emitProductDeleted, emitStockUpdated } from '../lib/socket.js';
import logger, { logError } from '../lib/logger.js';
import { ERR } from '../lib/messages.js';

type Variables = {
  user: AuthUser;
};

interface StockData {
  cabangId: string;
  quantity?: number;
  price?: number;
}

interface VariantData {
  id?: string;
  sku?: string;
  variantName: string;
  variantValue: string;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  imageUrl?: string | null;
  stocks?: StockData[];
}

interface ProductBody {
  name: string;
  description?: string;
  categoryId: string;
  productType: string;
  sku?: string;
  variants?: VariantData[];
  stocks?: StockData[];
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  imageUrl?: string | null;
  isActive?: boolean;
}

const products = new Hono<{ Variables: Variables }>();

// ==================== PRODUCT LIST & SEARCH ====================

// Get all products with filters and pagination (with Redis caching)
products.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: 'Diperlukan scope tenant' }, 400);
    }

    // Query parameters
    const categoryId = c.req.query('categoryId');
    const search = c.req.query('search');
    const isActive = c.req.query('isActive');
    
    // Pagination parameters
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200); // Max 200
    const skip = (page - 1) * limit;

    // Create cache key based on filters
    const filterKey = `${categoryId || 'all'}_${isActive || 'all'}_${search || 'none'}_p${page}_l${limit}`;
    const { getCacheOrSet, CacheKeys, CACHE_TTL } = await import('../lib/cache.js');
    
    const result = await getCacheOrSet(
      CacheKeys.products(tenantId, filterKey),
      async () => {
        const where: any = {
          tenantId: tenantId // Filter by tenant
        };
        if (categoryId) where.categoryId = categoryId;
        if (isActive !== undefined) where.isActive = isActive === 'true';

        // Build search conditions
        if (search) {
          const searchTerm = search.trim();
          const keywords = searchTerm.split(/\s+/).filter(k => k.length > 0);
          
          const searchConditions: any[] = [];
          
          searchConditions.push({ name: { contains: searchTerm, mode: 'insensitive' } });
          keywords.forEach(keyword => {
            searchConditions.push({ name: { contains: keyword, mode: 'insensitive' } });
          });
          
          searchConditions.push({ description: { contains: searchTerm, mode: 'insensitive' } });
          searchConditions.push({ 
            category: { name: { contains: searchTerm, mode: 'insensitive' } }
          });
          searchConditions.push({ 
            variants: { some: { sku: { contains: searchTerm, mode: 'insensitive' } } }
          });
          searchConditions.push({ 
            variants: { some: { variantValue: { contains: searchTerm, mode: 'insensitive' } } }
          });
          
          where.OR = searchConditions;
        }

        // Get total count for pagination
        const totalCount = await prisma.product.count({ where });
        const totalPages = Math.ceil(totalCount / limit);

        // Fetch products with pagination and optimized select
        const productList = await prisma.product.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            categoryId: true,
            productType: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            category: {
              select: {
                id: true,
                name: true,
                description: true
              }
            },
            variants: {
              select: {
                id: true,
                variantName: true,
                variantValue: true,
                sku: true,
                weight: true,
                length: true,
                width: true,
                height: true,
                imageUrl: true,
                stocks: {
                  select: {
                    id: true,
                    quantity: true,
                    price: true,
                    cabangId: true,
                    cabang: {
                      select: {
                        id: true,
                        name: true
                      }
                    }
                  }
                }
              }
            }
          },
          orderBy: search ? undefined : { name: 'asc' },
          skip,
          take: limit,
        });

        return {
          data: productList,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          }
        };
      },
      CACHE_TTL.SHORT // Cache for 1 minute (products change frequently)
    );

    return c.json(result);
  } catch (error) {
    logError(error, { context: 'Gagal mengambil data produk' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Get product by barcode
products.get('/barcode/:barcode', authMiddleware, async (c) => {
  try {
    const barcode = c.req.param('barcode');
    
    const variant = await prisma.productVariant.findUnique({
      where: { sku: barcode },
      include: {
        product: {
          include: {
            category: true,
            variants: {
              include: {
                stocks: { include: { cabang: true } }
              }
            }
          }
        }
      }
    });
    
    if (!variant) {
      return c.json({ error: 'Produk tidak ditemukan' }, 404);
    }
    
    return c.json(variant.product);
  } catch (error) {
    logError(error, { context: 'Get product by barcode error:' });
    return c.json({ error: 'Gagal mencari produk' }, 500);
  }
});

// Search by SKU
products.get('/search/sku/:sku', authMiddleware, async (c) => {
  try {
    const sku = c.req.param('sku');
    
    const variant = await prisma.productVariant.findUnique({
      where: { sku: sku.trim() },
      include: {
        product: { include: { category: true } },
        stocks: { include: { cabang: true } }
      }
    });
    
    if (!variant) {
      return c.json({ success: false, error: 'SKU tidak ditemukan' }, 404);
    }
    
    return c.json({
      success: true,
      data: {
        product: {
          id: variant.product.id,
          name: variant.product.name,
          description: variant.product.description,
          category: variant.product.category,
          productType: variant.product.productType
        },
        variant: {
          id: variant.id,
          sku: variant.sku,
          variantType: variant.variantName,
          value: variant.variantValue,
          stocks: variant.stocks
        }
      }
    });
  } catch (error) {
    logError(error, { context: 'Search SKU error:' });
    return c.json({ success: false, error: 'Gagal mencari SKU' }, 500);
  }
});

// Get all adjustments
products.get('/adjustments/all', authMiddleware, ownerOrManager, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const reason = c.req.query('reason');
    const limit = parseInt(c.req.query('limit') || '100');

    const where: any = {};
    if (cabangId) where.cabangId = cabangId;
    if (reason) where.reason = reason;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const adjustments = await prisma.stockAdjustment.findMany({
      where,
      include: {
        adjustedBy: { select: { id: true, name: true, email: true, role: true } },
        productVariant: {
          include: { product: { include: { category: true } } }
        },
        cabang: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const stats = {
      totalAdjustments: adjustments.length,
      totalIncrease: adjustments.filter(a => a.difference > 0).reduce((sum, a) => sum + a.difference, 0),
      totalDecrease: adjustments.filter(a => a.difference < 0).reduce((sum, a) => sum + Math.abs(a.difference), 0),
      byReason: {} as Record<string, number>
    };

    adjustments.forEach(adj => {
      if (adj.reason) {
        stats.byReason[adj.reason] = (stats.byReason[adj.reason] || 0) + 1;
      }
    });

    return c.json({ data: adjustments, stats });
  } catch (error) {
    logError(error, { context: 'Get all adjustments error:' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Get single product by ID
products.get('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const id = c.req.param('id');
    
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: {
          include: {
            stocks: { include: { cabang: true } }
          }
        }
      }
    });

    if (!product || product.tenantId !== tenantId) {
      return c.json({ error: ERR.PRODUCT_NOT_FOUND }, 404);
    }

    return c.json(product);
  } catch (error) {
    logError(error, { context: 'Get product error:' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// ==================== STOCK MANAGEMENT ====================

// Get stock by variant
products.get('/stock/:variantId', authMiddleware, async (c) => {
  try {
    const variantId = c.req.param('variantId');
    const cabangId = c.req.query('cabangId');

    const where: any = { productVariantId: variantId };
    if (cabangId) where.cabangId = cabangId;

    const stocks = await prisma.stock.findMany({
      where,
      include: {
        cabang: true,
        productVariant: { include: { product: true } }
      }
    });

    return c.json(stocks);
  } catch (error) {
    logError(error, { context: 'Get stock error:' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Get stock adjustment history
products.get('/stock/:variantId/:cabangId/adjustments', authMiddleware, async (c) => {
  try {
    const variantId = c.req.param('variantId');
    const cabangId = c.req.param('cabangId');
    const limit = parseInt(c.req.query('limit') || '50');

    const adjustments = await prisma.stockAdjustment.findMany({
      where: { productVariantId: variantId, cabangId },
      include: {
        adjustedBy: { select: { id: true, name: true, email: true } },
        productVariant: { include: { product: true } },
        cabang: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return c.json(adjustments);
  } catch (error) {
    logError(error, { context: 'Get adjustments error:' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Update stock
products.put('/stock/:variantId/:cabangId', authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const variantId = c.req.param('variantId');
    const cabangId = c.req.param('cabangId');
    const body = await c.req.json();
    const { quantity, price, reason, notes } = body as { quantity?: number; price?: number; reason?: string; notes?: string };

    const currentStock = await prisma.stock.findUnique({
      where: { productVariantId_cabangId: { productVariantId: variantId, cabangId } }
    });

    const previousQty = currentStock?.quantity || 0;
    const newQty = quantity !== undefined ? parseInt(String(quantity)) : previousQty;

    const result = await prisma.$transaction(async (tx) => {
      const stock = await tx.stock.upsert({
        where: { productVariantId_cabangId: { productVariantId: variantId, cabangId } },
        update: {
          quantity: quantity !== undefined ? newQty : undefined,
          price: price !== undefined ? parseFloat(String(price)) : undefined
        },
        create: {
          productVariantId: variantId,
          cabangId,
          quantity: newQty || 0,
          price: parseFloat(String(price)) || 0
        },
        include: {
          cabang: true,
          productVariant: { include: { product: true } }
        }
      });

      if (quantity !== undefined && previousQty !== newQty) {
        const reasonMap: Record<string, string> = {
          'Stok opname': 'STOCK_OPNAME',
          'Barang rusak': 'DAMAGED',
          'Barang hilang': 'LOST',
          'Return supplier': 'SUPPLIER_RETURN',
          'Koreksi input': 'INPUT_ERROR',
          'Lainnya': 'OTHER'
        };

        await tx.stockAdjustment.create({
          data: {
            stockId: stock.id,
            productVariantId: variantId,
            cabangId,
            adjustedById: user.userId,
            previousQty,
            newQty,
            difference: newQty - previousQty,
            reason: reason ? (reasonMap[reason] as any) : null,
            notes: notes || null
          }
        });
        
        await tx.product.update({
          where: { id: stock.productVariant.productId },
          data: { updatedAt: new Date() }
        });
      }

      return stock;
    });

    emitStockUpdated({
      productVariantId: variantId,
      cabangId,
      quantity: newQty,
      previousQuantity: previousQty,
      operation: 'set'
    }, cabangId, user.tenantId || undefined);

    return c.json(result);
  } catch (error: any) {
    logError(error, { context: 'Update stock error:' });
    return c.json({ error: 'Internal server error', message: error.message }, 500);
  }
});

// ==================== PRODUCT CRUD ====================

// Create product (Owner/Manager only)
// Rate limited: 50 products per 15 minutes
products.post('/', rateLimiter({ max: 50 }), authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const body = await c.req.json() as ProductBody;
    const { name, description, categoryId, productType, variants, sku, stocks } = body;

    if (!name || !categoryId || !productType) {
      return c.json({ error: 'Nama, kategori, dan tipe produk wajib diisi' }, 400);
    }

    // Verify category belongs to tenant
    const category = await prisma.category.findUnique({
      where: { id: categoryId }
    });

    if (!category || category.tenantId !== tenantId) {
      return c.json({ error: ERR.CATEGORY_NOT_FOUND }, 404);
    }

    if (productType === 'SINGLE') {
      if (!sku) return c.json({ error: ERR.SKU_REQUIRED }, 400);
      if (!stocks || stocks.length === 0) return c.json({ error: ERR.STOCK_REQUIRED }, 400);
    } else if (productType === 'VARIANT') {
      if (!variants || variants.length === 0) return c.json({ error: ERR.VARIANT_REQUIRED }, 400);
    }

    const product = await prisma.$transaction(async (tx) => {
      const newProduct = await tx.product.create({
        data: { name, description, categoryId, productType: productType as any, tenantId }
      });

      if (productType === 'VARIANT' && variants && variants.length > 0) {
        for (const variant of variants) {
          const newVariant = await tx.productVariant.create({
            data: {
              productId: newProduct.id,
              variantName: variant.variantName,
              variantValue: variant.variantValue,
              sku: variant.sku || `${newProduct.id}-${variant.variantValue}`,
              weight: variant.weight || null,
              length: variant.length || null,
              width: variant.width || null,
              height: variant.height || null,
              imageUrl: variant.imageUrl || null
            }
          });

          if (variant.stocks && variant.stocks.length > 0) {
            for (const stock of variant.stocks) {
              await tx.stock.upsert({
                where: { productVariantId_cabangId: { productVariantId: newVariant.id, cabangId: stock.cabangId } },
                update: { quantity: parseInt(String(stock.quantity)) || 0, price: parseFloat(String(stock.price)) || 0 },
                create: { productVariantId: newVariant.id, cabangId: stock.cabangId, quantity: parseInt(String(stock.quantity)) || 0, price: parseFloat(String(stock.price)) || 0 }
              });
            }
          }
        }
      } else if (productType === 'SINGLE') {
        const newVariant = await tx.productVariant.create({
          data: {
            productId: newProduct.id,
            variantName: 'Default',
            variantValue: 'Standard',
            sku: sku || `${newProduct.id}-DEFAULT`,
            weight: body.weight || null,
            length: body.length || null,
            width: body.width || null,
            height: body.height || null,
            imageUrl: body.imageUrl || null
          }
        });

        if (stocks && stocks.length > 0) {
          for (const stock of stocks) {
            await tx.stock.upsert({
              where: { productVariantId_cabangId: { productVariantId: newVariant.id, cabangId: stock.cabangId } },
              update: { quantity: parseInt(String(stock.quantity)) || 0, price: parseFloat(String(stock.price)) || 0 },
              create: { productVariantId: newVariant.id, cabangId: stock.cabangId, quantity: parseInt(String(stock.quantity)) || 0, price: parseFloat(String(stock.price)) || 0 }
            });
          }
        }
      }

      return tx.product.findUnique({
        where: { id: newProduct.id },
        include: { category: true, variants: true }
      });
    });

    emitProductCreated(product, tenantId);
    
    // Clear product cache
    const { clearProductCache } = await import('../lib/cache.js');
    await clearProductCache(tenantId, product?.id);
    
    return c.json(product, 201);
  } catch (error: any) {
    logError(error, { context: 'Create product error:' });
    if (error.code === 'P2002') return c.json({ error: ERR.SKU_EXISTS }, 400);
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Update product (Owner/Manager only)
products.put('/:id', authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const id = c.req.param('id');
    const body = await c.req.json() as ProductBody;
    const { name, description, categoryId, productType, isActive, variants } = body;

    // Verify product belongs to tenant
    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct || existingProduct.tenantId !== tenantId) {
      return c.json({ error: ERR.PRODUCT_NOT_FOUND }, 404);
    }

    // Verify category belongs to tenant if categoryId is being updated
    if (categoryId && categoryId !== existingProduct.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId }
      });

      if (!category || category.tenantId !== tenantId) {
        return c.json({ error: ERR.CATEGORY_NOT_FOUND }, 404);
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id },
        data: { name, description, categoryId, productType: productType as any, isActive, updatedAt: new Date() }
      });

      if (productType === 'SINGLE' && variants && variants.length > 0) {
        const variant = variants[0];
        if (variant.id) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              variantName: variant.variantName || 'Default',
              variantValue: variant.variantValue || 'Standard',
              sku: variant.sku,
              weight: variant.weight || null,
              length: variant.length || null,
              width: variant.width || null,
              height: variant.height || null,
              imageUrl: variant.imageUrl || null
            }
          });

          if (variant.stocks && variant.stocks.length > 0) {
            for (const stock of variant.stocks) {
              await tx.stock.upsert({
                where: { productVariantId_cabangId: { productVariantId: variant.id, cabangId: stock.cabangId } },
                update: { quantity: parseInt(String(stock.quantity)) || 0, price: stock.price !== undefined ? parseFloat(String(stock.price)) : 0 },
                create: { productVariantId: variant.id, cabangId: stock.cabangId, quantity: parseInt(String(stock.quantity)) || 0, price: stock.price !== undefined ? parseFloat(String(stock.price)) : 0 }
              });
            }
          }
        }
      } else if (productType === 'VARIANT' && variants && variants.length > 0) {
        const existingVariants = await tx.productVariant.findMany({
          where: { productId: id },
          select: { id: true }
        });
        const existingIds = existingVariants.map(v => v.id);
        const providedIds = variants.filter(v => v.id).map(v => v.id!);
        const idsToDelete = existingIds.filter(vid => !providedIds.includes(vid));
        
        if (idsToDelete.length > 0) {
          await tx.productVariant.deleteMany({ where: { id: { in: idsToDelete } } });
        }

        for (const variant of variants) {
          if (variant.id) {
            await tx.productVariant.update({
              where: { id: variant.id },
              data: {
                variantName: variant.variantName,
                variantValue: variant.variantValue,
                sku: variant.sku,
                weight: variant.weight || null,
                length: variant.length || null,
                width: variant.width || null,
                height: variant.height || null,
                imageUrl: variant.imageUrl || null
              }
            });

            if (variant.stocks && variant.stocks.length > 0) {
              for (const stock of variant.stocks) {
                await tx.stock.upsert({
                  where: { productVariantId_cabangId: { productVariantId: variant.id, cabangId: stock.cabangId } },
                  update: { quantity: parseInt(String(stock.quantity)) || 0, price: stock.price !== undefined ? parseFloat(String(stock.price)) : 0 },
                  create: { productVariantId: variant.id, cabangId: stock.cabangId, quantity: parseInt(String(stock.quantity)) || 0, price: stock.price !== undefined ? parseFloat(String(stock.price)) : 0 }
                });
              }
            }
          } else {
            const newVariant = await tx.productVariant.create({
              data: {
                productId: updatedProduct.id,
                variantName: variant.variantName,
                variantValue: variant.variantValue,
                sku: variant.sku || `${updatedProduct.id}-${variant.variantValue}`,
                weight: variant.weight || null,
                length: variant.length || null,
                width: variant.width || null,
                height: variant.height || null,
                imageUrl: variant.imageUrl || null
              }
            });

            if (variant.stocks && variant.stocks.length > 0) {
              for (const stock of variant.stocks) {
                await tx.stock.create({
                  data: {
                    productVariantId: newVariant.id,
                    cabangId: stock.cabangId,
                    quantity: parseInt(String(stock.quantity)) || 0,
                    price: stock.price !== undefined ? parseFloat(String(stock.price)) : 0
                  }
                });
              }
            }
          }
        }
      }

      return tx.product.findUnique({
        where: { id },
        include: {
          category: true,
          variants: { include: { stocks: { include: { cabang: true } } } }
        }
      });
    });

    emitProductUpdated(product, tenantId);
    return c.json(product);
  } catch (error: any) {
    logError(error, { context: 'Update product error:' });
    if (error.code === 'P2025') return c.json({ error: ERR.PRODUCT_NOT_FOUND }, 404);
    if (error.code === 'P2002') return c.json({ error: ERR.SKU_EXISTS }, 400);
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Delete product (Owner/Manager only)
// Rate limited: 20 deletions per 15 minutes
products.delete('/:id', rateLimiter({ max: 20 }), authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const id = c.req.param('id');
    
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: { transactionItems: { take: 1 } }
        }
      }
    });

    if (!product || product.tenantId !== tenantId) {
      return c.json({ error: ERR.PRODUCT_NOT_FOUND }, 404);
    }

    const hasTransactions = product.variants.some(v => v.transactionItems.length > 0);

    if (hasTransactions) {
      const updatedProduct = await prisma.product.update({
        where: { id },
        data: { isActive: false }
      });

      emitProductUpdated(updatedProduct, tenantId);
      return c.json({ 
        message: 'Product has transaction history. Product has been deactivated instead of deleted.',
        action: 'deactivated'
      });
    }

    await prisma.product.delete({ where: { id } });
    emitProductDeleted(id, tenantId);

    return c.json({ message: 'Product deleted successfully', action: 'deleted' });
  } catch (error: any) {
    logError(error, { context: 'Delete product error:' });
    if (error.code === 'P2025') return c.json({ error: ERR.PRODUCT_NOT_FOUND }, 404);
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// ==================== BULK OPERATIONS ====================

// Bulk delete products
products.post('/bulk-delete', authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const body = await c.req.json();
    const { productIds } = body as { productIds: string[] };

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return c.json({ error: 'Product IDs harus berupa array dan tidak boleh kosong' }, 400);
    }

    // Limit bulk delete to 100 products at a time
    if (productIds.length > 100) {
      return c.json({ error: 'Maksimal 100 produk per bulk delete' }, 400);
    }

    // Verify all products belong to tenant
    const productsList = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        tenantId
      },
      include: {
        variants: {
          include: {
            transactionItems: { take: 1 }
          }
        }
      }
    });

    if (productsList.length !== productIds.length) {
      return c.json({ 
        error: 'Beberapa produk tidak ditemukan atau bukan milik tenant Anda' 
      }, 404);
    }

    // Separate products with and without transactions
    const productsWithTransactions: string[] = [];
    const productsToDelete: string[] = [];

    for (const product of productsList) {
      const hasTransactions = product.variants.some(v => v.transactionItems.length > 0);
      if (hasTransactions) {
        productsWithTransactions.push(product.id);
      } else {
        productsToDelete.push(product.id);
      }
    }

    // Delete products without transactions
    let deletedCount = 0;
    if (productsToDelete.length > 0) {
      const result = await prisma.product.deleteMany({
        where: {
          id: { in: productsToDelete },
          tenantId
        }
      });
      deletedCount = result.count;
    }

    // Deactivate products with transactions
    let deactivatedCount = 0;
    if (productsWithTransactions.length > 0) {
      const result = await prisma.product.updateMany({
        where: {
          id: { in: productsWithTransactions },
          tenantId
        },
        data: { isActive: false }
      });
      deactivatedCount = result.count;
    }

    // Emit socket events for each product (scoped to tenant)
    productsToDelete.forEach(id => emitProductDeleted(id, tenantId));
    
    logger.info('Bulk delete products', {
      tenantId,
      total: productIds.length,
      deleted: deletedCount,
      deactivated: deactivatedCount,
    });

    return c.json({
      message: 'Bulk delete completed',
      total: productIds.length,
      deleted: deletedCount,
      deactivated: deactivatedCount,
      details: {
        deletedIds: productsToDelete,
        deactivatedIds: productsWithTransactions,
      }
    });
  } catch (error: any) {
    logError(error, { context: 'Bulk delete products' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

export default products;
