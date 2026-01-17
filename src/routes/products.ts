import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOrManager, type AuthUser } from '../middleware/auth.js';
import { rateLimiter, strictRateLimiter } from '../middleware/rate-limit.js';
import { emitProductCreated, emitProductUpdated, emitProductDeleted, emitCategoryUpdated, emitStockUpdated } from '../lib/socket.js';
import logger, { logError } from '../lib/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { ExcelHelper } from '../lib/excel.js';
import { validate, createCategorySchema, updateCategorySchema } from '../lib/validators.js';
import { sanitizeString, sanitizeText, sanitizeSku, sanitizeUrl, sanitizePositiveInt, sanitizeNumber } from '../lib/sanitize.js';
import { ERR, MSG } from '../lib/messages.js';

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

// Get all categories (with Redis caching)
products.get('/categories', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    // Try cache first
    const { getCacheOrSet, CacheKeys, CACHE_TTL } = await import('../lib/cache.js');
    
    const categories = await getCacheOrSet(
      CacheKeys.categories(tenantId),
      async () => {
        return await prisma.category.findMany({
          where: { tenantId },
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { 
                products: {
                  where: { isActive: true }
                }
              }
            }
          },
          orderBy: { name: 'asc' }
        });
      },
      CACHE_TTL.MEDIUM // Cache for 5 minutes
    );
    
    return c.json(categories);
  } catch (error) {
    logError(error, { context: 'Gagal mengambil kategori' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Create category (Owner/Manager only)
products.post('/categories', authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const body = await c.req.json();
    const validation = validate(createCategorySchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const { name, description } = validation.data;

    const category = await prisma.category.create({
      data: { name, description, tenantId }
    });

    // Clear category cache
    const { clearCategoryCache } = await import('../lib/cache.js');
    await clearCategoryCache(tenantId);

    emitCategoryUpdated(category);
    return c.json(category, 201);
  } catch (error: any) {
    logError(error, { context: 'Gagal membuat kategori' });
    if (error.code === 'P2002') {
      return c.json({ error: ERR.CATEGORY_EXISTS }, 400);
    }
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Update category (Owner/Manager only)
products.put('/categories/:id', authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const id = c.req.param('id');
    const body = await c.req.json();
    const validation = validate(updateCategorySchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const { name, description } = validation.data;

    if (!name) {
      return c.json({ error: ERR.CATEGORY_NAME_REQUIRED }, 400);
    }

    // Verify category belongs to tenant
    const existingCategory = await prisma.category.findUnique({
      where: { id }
    });

    if (!existingCategory || existingCategory.tenantId !== tenantId) {
      return c.json({ error: ERR.CATEGORY_NOT_FOUND }, 404);
    }

    const category = await prisma.category.update({
      where: { id },
      data: { name, description }
    });

    // Clear category cache
    const { clearCategoryCache } = await import('../lib/cache.js');
    await clearCategoryCache(tenantId, id);

    emitCategoryUpdated(category);
    return c.json(category);
  } catch (error: any) {
    logError(error, { context: 'Gagal update kategori' });
    if (error.code === 'P2002') {
      return c.json({ error: ERR.CATEGORY_EXISTS }, 400);
    }
    if (error.code === 'P2025') {
      return c.json({ error: ERR.CATEGORY_NOT_FOUND }, 404);
    }
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Delete category (Owner/Manager only)
products.delete('/categories/:id', authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const id = c.req.param('id');
    
    // Verify category belongs to tenant
    const existingCategory = await prisma.category.findUnique({
      where: { id }
    });

    if (!existingCategory || existingCategory.tenantId !== tenantId) {
      return c.json({ error: ERR.CATEGORY_NOT_FOUND }, 404);
    }
    
    // Use transaction for atomic deletion of category and related data
    const deletedCount = await prisma.$transaction(async (tx) => {
      const categoryProducts = await tx.product.findMany({
        where: { categoryId: id, tenantId },
        include: { variants: true }
      });

      if (categoryProducts.length > 0) {
        const variantIds = categoryProducts.flatMap(p => p.variants.map(v => v.id));

        if (variantIds.length > 0) {
          await tx.stockAdjustment.deleteMany({
            where: { productVariantId: { in: variantIds } }
          });

          await tx.productVariant.deleteMany({
            where: { id: { in: variantIds } }
          });
        }

        await tx.product.deleteMany({
          where: { categoryId: id }
        });
      }

      await tx.category.delete({
        where: { id }
      });

      return categoryProducts.length;
    });

    // Clear category cache
    const { clearCategoryCache } = await import('../lib/cache.js');
    await clearCategoryCache(tenantId, id);

    return c.json({ 
      message: 'Category deleted successfully',
      productsDeleted: deletedCount
    });
  } catch (error: any) {
    logError(error, { context: 'Delete category error:' });
    if (error.code === 'P2025') {
      return c.json({ error: ERR.CATEGORY_NOT_FOUND }, 404);
    }
    if (error.code === 'P2003') {
      return c.json({ error: ERR.CATEGORY_HAS_PRODUCTS }, 400);
    }
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

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

// Download Template
products.get('/template', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const categories = await prisma.category.findMany({ 
      where: { tenantId },
      orderBy: { name: 'asc' } 
    });
    const cabangs = await prisma.cabang.findMany({ 
      where: { isActive: true, tenantId }, 
      orderBy: { name: 'asc' } 
    });
    
    if (categories.length === 0 || cabangs.length === 0) {
      return c.json({ 
        error: 'Tidak ada kategori atau cabang. Buat kategori dan cabang terlebih dahulu.' 
      }, 400);
    }

    const workbook = await ExcelHelper.createWorkbook();

    // Sheet 1: Data
    const refData: any[] = [];
    refData.push(['KATEGORI', 'CABANG', 'TIPE_PRODUK']);
    const maxRows = Math.max(categories.length, cabangs.length, 2);
    for (let i = 0; i < maxRows; i++) {
      refData.push([
        categories[i]?.name || '',
        cabangs[i]?.name || '',
        i === 0 ? 'SINGLE' : (i === 1 ? 'VARIANT' : '')
      ]);
    }
    ExcelHelper.addWorksheet(workbook, 'Data', refData);

    // Sheet 2: Panduan
    const infoData: any[] = [];
    infoData.push(['PANDUAN IMPORT PRODUK']);
    infoData.push([]);
    infoData.push(['LANGKAH-LANGKAH:']);
    infoData.push(['1. Pindah ke Sheet "Template Import"']);
    infoData.push(['2. Gunakan DROPDOWN untuk pilih Kategori, Cabang, dan Tipe Produk']);
    infoData.push(['3. Isi data produk sesuai contoh']);
    infoData.push(['4. Simpan file dan upload ke sistem']);
    infoData.push([]);
    infoData.push(['REFERENSI KATEGORI:']);
    categories.forEach(cat => {
      infoData.push([cat.name, cat.description || '-']);
    });
    infoData.push([]);
    infoData.push(['REFERENSI CABANG:']);
    cabangs.forEach(cabang => {
      infoData.push([cabang.name, cabang.address || '-']);
    });
    ExcelHelper.addWorksheet(workbook, 'Panduan', infoData);

    // Sheet 3: Template Import
    const templateData: any[] = [];
    // Header group row
    templateData.push([
      'INFO PRODUK', '', '', '', '',
      'VARIANT ATTRIBUTES', '', '', '', '', '',
      'PRICING & STOCK', '', '',
      'SPESIFIKASI MARKETPLACE', '', '', '', ''
    ]);
    // Column headers
    templateData.push([
      'SKU*', 'Nama Produk*', 'Deskripsi', 'Kategori*', 'Tipe Produk*',
      'Type 1', 'Value 1', 'Type 2', 'Value 2', 'Type 3', 'Value 3',
      'Harga*', 'Stok*', 'Cabang*',
      'Berat (g)', 'Panjang (cm)', 'Lebar (cm)', 'Tinggi (cm)', 'Link Gambar'
    ]);
    for (let i = 0; i < 100; i++) {
      templateData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }
    
    ExcelHelper.addWorksheet(workbook, 'Template Import', templateData, {
      columnWidths: [15, 25, 20, 15, 12, 12, 15, 12, 15, 12, 15, 12, 10, 15, 10, 12, 12, 12, 30],
      merges: [
        { start: { row: 1, col: 1 }, end: { row: 1, col: 5 } },   // INFO PRODUK
        { start: { row: 1, col: 6 }, end: { row: 1, col: 11 } },  // VARIANT ATTRIBUTES
        { start: { row: 1, col: 12 }, end: { row: 1, col: 14 } }, // PRICING & STOCK
        { start: { row: 1, col: 15 }, end: { row: 1, col: 19 } }  // SPESIFIKASI MARKETPLACE
      ]
    });

    // Write to buffer and return as base64
    const buffer = await ExcelHelper.writeToBuffer(workbook);
    const base64Data = buffer.toString('base64');

    return c.json({
      filename: 'template-import-produk.xlsx',
      data: base64Data,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  } catch (error) {
    logError(error, { context: 'Download template error:' });
    return c.json({ error: 'Gagal mengunduh template' }, 500);
  }
});

// Export Products
products.get('/export', authMiddleware, async (c) => {
  try {
    const productList = await prisma.product.findMany({
      include: {
        category: true,
        variants: {
          include: {
            stocks: {
              include: { cabang: true }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const exportData: any[] = [];
    productList.forEach(product => {
      product.variants.forEach(variant => {
        variant.stocks.forEach(stock => {
          const variantNames = variant.variantName?.split(' | ') || [];
          const variantValues = variant.variantValue?.split(' | ') || [];
          
          exportData.push([
            variant.sku || '',
            product.name,
            product.description || '',
            product.category?.name || '',
            product.productType,
            variantNames[0] || '',
            variantValues[0] || '',
            variantNames[1] || '',
            variantValues[1] || '',
            variantNames[2] || '',
            variantValues[2] || '',
            stock.price || 0,
            stock.quantity || 0,
            stock.cabang.name,
            variant.weight || '',
            variant.length || '',
            variant.width || '',
            variant.height || '',
            variant.imageUrl || ''
          ]);
        });
      });
    });

    if (exportData.length === 0) {
      return c.json({ error: 'Tidak ada data produk untuk diexport' }, 404);
    }

    const workbook = await ExcelHelper.createWorkbook();
    const header = [
      'SKU*', 'Nama Produk*', 'Deskripsi', 'Kategori*', 'Tipe Produk*',
      'Type 1', 'Value 1', 'Type 2', 'Value 2', 'Type 3', 'Value 3',
      'Harga*', 'Stok*', 'Cabang*',
      'Berat (g)', 'Panjang (cm)', 'Lebar (cm)', 'Tinggi (cm)', 'Link Gambar'
    ];
    const worksheetData = [header, ...exportData];
    ExcelHelper.addWorksheet(workbook, 'Export Produk', worksheetData);
    
    // Write to buffer and return as base64
    const buffer = await ExcelHelper.writeToBuffer(workbook);
    const base64Data = buffer.toString('base64');
    const fileName = `export-produk-${Date.now()}.xlsx`;

    return c.json({
      filename: fileName,
      data: base64Data,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  } catch (error) {
    logError(error, { context: 'Export error:' });
    return c.json({ error: 'Gagal export produk' }, 500);
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

    emitProductCreated(product);
    
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

    emitProductUpdated(product);
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

      emitProductUpdated(updatedProduct);
      return c.json({ 
        message: 'Product has transaction history. Product has been deactivated instead of deleted.',
        action: 'deactivated'
      });
    }

    await prisma.product.delete({ where: { id } });
    emitProductDeleted(id);

    return c.json({ message: 'Product deleted successfully', action: 'deleted' });
  } catch (error: any) {
    logError(error, { context: 'Delete product error:' });
    if (error.code === 'P2025') return c.json({ error: ERR.PRODUCT_NOT_FOUND }, 404);
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
    });

    return c.json(result);
  } catch (error: any) {
    logError(error, { context: 'Update stock error:' });
    return c.json({ error: 'Internal server error', message: error.message }, 500);
  }
});

// Import Products from Excel - Full implementation with Hono multipart
// Rate limited: 3 imports per 15 minutes (heavy operation)
products.post('/import', strictRateLimiter({ max: 3 }), authMiddleware, ownerOrManager, async (c) => {
  let tempFilePath: string | null = null;
  
  // File size limit: 10MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  
  try {
    // Parse multipart form data
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'File tidak ditemukan' }, 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ 
        error: `Ukuran file terlalu besar. Maksimal ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
      }, 400);
    }

    const fileExtension = path.extname(file.name).toLowerCase();
    
    if (!['.xlsx', '.xls'].includes(fileExtension)) {
      return c.json({ error: 'Format file tidak didukung. Gunakan Excel (.xlsx atau .xls)' }, 400);
    }

    // Read file as buffer and parse directly (ESM compatible)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Parse Excel - read "Template Import" sheet
    const workbook = await ExcelHelper.readFromBuffer(buffer);
    
    // Try to find the template sheet
    let sheetName = 'Template Import';
    const worksheet = workbook.getWorksheet(sheetName) || 
                      workbook.worksheets.find(ws => ws.name.toLowerCase().includes('template')) ||
                      workbook.worksheets[0];
    
    if (!worksheet) {
      return c.json({ error: 'Sheet tidak ditemukan. Pastikan file Excel memiliki sheet dengan data.' }, 400);
    }
    
    // Parse with header row at index 2 (row 2 in Excel - row 1 is group header)
    const products_data = ExcelHelper.worksheetToJSON(worksheet, 2);

    if (products_data.length === 0) {
      return c.json({ error: 'File kosong atau format tidak valid. Pastikan Sheet "Template Import" berisi data dengan header di baris 2.' }, 400);
    }

    // Get all categories and cabangs
        const user = c.get('user');
        const tenantId = user.tenantId;
        
        if (!tenantId) {
          return c.json({ error: ERR.TENANT_REQUIRED }, 400);
        }

        const categories = await prisma.category.findMany({
          where: { tenantId }
        });
    const cabangs = await prisma.cabang.findMany();

    const errors: any[] = [];
    const success: any[] = [];
    const productsToCreate = new Map<string, any>();

    // Collect all SKUs from Excel first
    const allSkus = products_data
      .map((row: any) => row['SKU']?.toString().trim() || row['SKU*']?.toString().trim())
      .filter(Boolean);
    
    // Check for duplicate SKUs within Excel file
    const skuCounts = new Map<string, number[]>();
    allSkus.forEach((sku, idx) => {
      if (!skuCounts.has(sku)) {
        skuCounts.set(sku, []);
      }
      skuCounts.get(sku)!.push(idx + 2); // +2 because: +1 for header, +1 for 1-based indexing
    });
    
    const duplicateSkus = Array.from(skuCounts.entries()).filter(([_, rows]) => rows.length > 1);
    if (duplicateSkus.length > 0) {
      duplicateSkus.forEach(([sku, rows]) => {
        errors.push({ 
          error: `SKU "${sku}" duplikat ditemukan di baris: ${rows.join(', ')}. Setiap SKU harus unik.` 
        });
      });
    }

    // Fetch existing SKUs with product and stock data for upsert
    const existingVariants = await prisma.productVariant.findMany({
      where: { sku: { in: allSkus } },
      include: {
        product: { include: { category: true } },
        stocks: { include: { cabang: true } }
      }
    });
    
    const existingVariantsMap = new Map(
      existingVariants.map(v => [v.sku, v])
    );

    // Process each row
    for (let i = 0; i < products_data.length; i++) {
      const row = products_data[i];
      const rowNum = i + 2;

      try {
        const hasData = Object.values(row).some(val => val !== '' && val !== null && val !== undefined);
        if (!hasData) continue;

        // Support both formats (with and without asterisks) - WITH SANITIZATION
        const sku = sanitizeSku(row['SKU*'] || row['SKU']);
        const productName = sanitizeString(row['Nama Produk*'] || row['Nama Produk'], 200);
        const categoryName = sanitizeString(row['Kategori*'] || row['Kategori'], 100);
        const productType = sanitizeString(row['Tipe Produk*'] || row['Tipe Produk'], 10)?.toUpperCase();
        const price = sanitizePositiveInt(row['Harga*'] || row['Harga']);
        const stockRaw = row['Stok*'] || row['Stok'];
        const stock = sanitizePositiveInt(stockRaw);
        const cabangName = sanitizeString(row['Cabang*'] || row['Cabang'], 100);
        
        // Parse alert data (optional) - WITH SANITIZATION
        const minAlert = row['Min Alert'] ? sanitizePositiveInt(row['Min Alert']) : null;
        const alertActive = sanitizeString(row['Alert Active'])?.toLowerCase();
        const isAlertActive = alertActive === 'yes' || alertActive === 'ya' || alertActive === '1' || alertActive === 'true';

        // Validate required fields (stock defaults to 0 if empty)
        if (!sku || !productName || !categoryName || !productType || isNaN(price) || !cabangName) {
          errors.push({ row: rowNum, error: 'Data tidak lengkap. Pastikan SKU, Nama Produk, Kategori, Tipe Produk, Harga, dan Cabang diisi' });
          continue;
        }
        
        // Validate stock is a valid number (including 0)
        if (isNaN(stock) || stock < 0) {
          errors.push({ row: rowNum, error: 'Stok harus berupa angka >= 0' });
          continue;
        }

        if (!['SINGLE', 'VARIANT'].includes(productType)) {
          errors.push({ row: rowNum, error: 'Tipe Produk harus SINGLE atau VARIANT' });
          continue;
        }

        const category = categories.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase());
        if (!category) {
          errors.push({ row: rowNum, error: `Kategori "${categoryName}" tidak ditemukan` });
          continue;
        }

        const cabang = cabangs.find(cab => cab.name.toLowerCase() === cabangName.toLowerCase());
        if (!cabang) {
          errors.push({ row: rowNum, error: `Cabang "${cabangName}" tidak ditemukan` });
          continue;
        }

        // UPSERT: Check if SKU exists
        const existingVariant = existingVariantsMap.get(sku);
        
        if (existingVariant) {
          const existingProduct = existingVariant.product;
          
          if (existingProduct.productType !== productType) {
            errors.push({ row: rowNum, error: `SKU "${sku}" sudah terdaftar dengan tipe ${existingProduct.productType}` });
            continue;
          }
          
          const existingStock = existingVariant.stocks.find(s => s.cabangId === cabang.id);
          
          if (existingStock) {
            await prisma.stock.update({
              where: { id: existingStock.id },
              data: { quantity: stock, price: price }
            });
            
            // Handle alert update/create for existing variant
            if (minAlert !== null && minAlert > 0) {
              await prisma.stockAlert.upsert({
                where: {
                  productVariantId_cabangId: {
                    productVariantId: existingVariant.id,
                    cabangId: cabang.id
                  }
                },
                update: {
                  minStock: minAlert,
                  isActive: isAlertActive
                },
                create: {
                  productVariantId: existingVariant.id,
                  cabangId: cabang.id,
                  minStock: minAlert,
                  isActive: isAlertActive
                }
              });
            }
            
            success.push({
              row: rowNum, sku, product: productName, action: 'updated',
              message: `Stock di ${cabangName} diupdate: ${stock} pcs @ Rp ${price.toLocaleString('id-ID')}${minAlert ? ` (Alert: ${minAlert})` : ''}`
            });
            
            emitStockUpdated({
              productId: existingProduct.id,
              variantId: existingVariant.id,
              cabangId: cabang.id,
              quantity: stock,
              price: price
            });
          } else {
            await prisma.stock.create({
              data: { productVariantId: existingVariant.id, cabangId: cabang.id, quantity: stock, price: price }
            });
            
            // Handle alert create for new stock
            if (minAlert !== null && minAlert > 0) {
              await prisma.stockAlert.upsert({
                where: {
                  productVariantId_cabangId: {
                    productVariantId: existingVariant.id,
                    cabangId: cabang.id
                  }
                },
                update: {
                  minStock: minAlert,
                  isActive: isAlertActive
                },
                create: {
                  productVariantId: existingVariant.id,
                  cabangId: cabang.id,
                  minStock: minAlert,
                  isActive: isAlertActive
                }
              });
            }
            
            success.push({
              row: rowNum, sku, product: productName, action: 'stock_added',
              message: `Stock baru ditambahkan di ${cabangName}: ${stock} pcs @ Rp ${price.toLocaleString('id-ID')}${minAlert ? ` (Alert: ${minAlert})` : ''}`
            });
            
            emitStockUpdated({
              productId: existingProduct.id,
              variantId: existingVariant.id,
              cabangId: cabang.id,
              quantity: stock,
              price: price
            });
          }
          continue;
        }
        
        // NEW SKU - CREATE mode
        const productKey = productName.toLowerCase();
        
        if (!productsToCreate.has(productKey)) {
          productsToCreate.set(productKey, {
            name: productName,
            description: sanitizeText(row['Deskripsi'], 1000), // Sanitize description
            categoryId: category.id,
            productType,
            isActive: true,
            variants: []
          });
        }

        const productData = productsToCreate.get(productKey);

        if (productData.productType !== productType) {
          errors.push({ row: rowNum, error: `Produk "${productName}" memiliki tipe yang berbeda dalam file` });
          continue;
        }

        // Parse variant attributes - WITH SANITIZATION
        let variantName = 'Default';
        let variantValue = 'Default';
        
        if (productType === 'VARIANT') {
          const types: string[] = [];
          const values: string[] = [];
          
          for (let n = 1; n <= 3; n++) {
            const typeN = sanitizeString(row[`Type ${n}`], 50);
            const valueN = sanitizeString(row[`Value ${n}`], 50);
            if (typeN && valueN) {
              types.push(typeN);
              values.push(valueN);
            }
          }
          
          if (types.length === 0) {
            errors.push({ row: rowNum, error: 'Produk VARIANT harus memiliki minimal 1 pasang Type dan Value' });
            continue;
          }
          
          variantName = types.join(' | ');
          variantValue = values.join(' | ');
        }

        // Sanitize dimensions and URL
        const weight = row['Berat (g)'] ? sanitizePositiveInt(row['Berat (g)']) : null;
        const length = row['Panjang (cm)'] ? sanitizePositiveInt(row['Panjang (cm)']) : null;
        const width = row['Lebar (cm)'] ? sanitizePositiveInt(row['Lebar (cm)']) : null;
        const height = row['Tinggi (cm)'] ? sanitizePositiveInt(row['Tinggi (cm)']) : null;
        const imageUrl = sanitizeUrl(row['Link Gambar']);

        productData.variants.push({
          sku, variantName, variantValue, weight, length, width, height, imageUrl,
          stocks: [{ cabangId: cabang.id, quantity: stock, price: price }],
          alert: minAlert !== null && minAlert > 0 ? { minStock: minAlert, isActive: isAlertActive, cabangId: cabang.id } : null
        });

      } catch (error: any) {
        errors.push({ row: rowNum, error: error.message });
      }
    }

    // Preview mode
    const isPreview = c.req.query('preview') === 'true';
    
    if (isPreview) {
      if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      
      return c.json({
        preview: true,
        success: errors.length === 0,
        totalRows: products_data.length,
        validRows: productsToCreate.size,
        invalidRows: errors.length,
        productsToCreate: Array.from(productsToCreate.values()).map(p => ({
          name: p.name, type: p.productType, variants: p.variants.length,
          category: categories.find(cat => cat.id === p.categoryId)?.name
        })),
        errors
      });
    }

    // Create products in database
    for (const [productKey, productData] of productsToCreate) {
      try {
        // Validate: VARIANT must have at least 2 variants
        if (productData.productType === 'VARIANT' && productData.variants.length < 2) {
          errors.push({ 
            product: productData.name, 
            error: `Produk VARIANT harus memiliki minimal 2 varian (ditemukan ${productData.variants.length}). Ubah ke SINGLE jika hanya 1 varian.` 
          });
          continue;
        }
        
        // Validate: SINGLE should have exactly 1 variant
        if (productData.productType === 'SINGLE' && productData.variants.length > 1) {
          errors.push({ 
            product: productData.name, 
            error: `Produk SINGLE tidak boleh memiliki lebih dari 1 varian (ditemukan ${productData.variants.length}). Ubah ke VARIANT atau gabungkan data.` 
          });
          continue;
        }
        
        const variantValues = productData.variants.map((v: any) => v.variantValue);
        const duplicates = variantValues.filter((val: string, idx: number) => variantValues.indexOf(val) !== idx);
        
        if (duplicates.length > 0) {
          errors.push({ product: productData.name, error: `Variant duplikat: "${duplicates[0]}"` });
          continue;
        }

        const product = await prisma.product.create({
          data: {
            name: productData.name,
            description: productData.description,
            categoryId: productData.categoryId,
            productType: productData.productType,
            isActive: productData.isActive,
            tenantId: tenantId,
            variants: {
              create: productData.variants.map((v: any) => ({
                sku: v.sku,
                variantName: v.variantName,
                variantValue: v.variantValue,
                weight: v.weight,
                length: v.length,
                width: v.width,
                height: v.height,
                imageUrl: v.imageUrl,
                stocks: { create: v.stocks }
              }))
            }
          },
          include: { variants: { include: { stocks: true } } }
        });
        
        // Create alerts after product creation
        for (const variant of productData.variants) {
          if (variant.alert) {
            const createdVariant = product.variants.find(pv => pv.sku === variant.sku);
            if (createdVariant) {
              await prisma.stockAlert.create({
                data: {
                  productVariantId: createdVariant.id,
                  cabangId: variant.alert.cabangId,
                  minStock: variant.alert.minStock,
                  isActive: variant.alert.isActive
                }
              });
            }
          }
        }

        success.push({
          product: product.name, variants: product.variants.length, action: 'created',
          message: `Berhasil import produk baru dengan ${product.variants.length} varian`
        });

        emitProductCreated(product);

      } catch (error: any) {
        let errorMsg = 'Gagal membuat produk';
        if (error.code === 'P2002') {
          if (error.meta?.target?.includes('sku')) errorMsg = 'SKU sudah terdaftar';
          else errorMsg = `Data duplikat: ${error.meta?.target?.join(', ') || 'unknown'}`;
        }
        errors.push({ product: productData.name, error: errorMsg });
      }
    }

    // Cleanup temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    const warnings = errors.filter(e => e.type === 'warning');
    const actualErrors = errors.filter(e => e.type !== 'warning');

    return c.json({
      success: success.length > 0,
      imported: success.length,
      failed: actualErrors.length,
      warnings: warnings.length,
      details: { success, errors: actualErrors, warnings }
    });

  } catch (error: any) {
    logError(error, { context: 'Import error:' });
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    return c.json({ error: 'Gagal import produk: ' + error.message }, 500);
  }
});

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
    const products = await prisma.product.findMany({
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

    if (products.length !== productIds.length) {
      return c.json({ 
        error: 'Beberapa produk tidak ditemukan atau bukan milik tenant Anda' 
      }, 404);
    }

    // Separate products with and without transactions
    const productsWithTransactions: string[] = [];
    const productsToDelete: string[] = [];

    for (const product of products) {
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

    // Emit socket events for each product
    productsToDelete.forEach(id => emitProductDeleted(id));
    
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

// Bulk delete categories
products.post('/categories/bulk-delete', authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const body = await c.req.json();
    const { categoryIds } = body as { categoryIds: string[] };

    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return c.json({ error: 'Category IDs harus berupa array dan tidak boleh kosong' }, 400);
    }

    // Limit bulk delete to 50 categories at a time
    if (categoryIds.length > 50) {
      return c.json({ error: 'Maksimal 50 kategori per bulk delete' }, 400);
    }

    // Verify all categories belong to tenant
    const categories = await prisma.category.findMany({
      where: {
        id: { in: categoryIds },
        tenantId
      }
    });

    if (categories.length !== categoryIds.length) {
      return c.json({ 
        error: 'Beberapa kategori tidak ditemukan atau bukan milik tenant Anda' 
      }, 404);
    }

    // Use transaction for atomic bulk deletion
    const { deletedCount, productsDeleted } = await prisma.$transaction(async (tx) => {
      // Get all products in these categories
      const categoryProducts = await tx.product.findMany({
        where: { 
          categoryId: { in: categoryIds },
          tenantId 
        },
        include: { variants: true }
      });

      let totalProductsDeleted = 0;

      if (categoryProducts.length > 0) {
        const variantIds = categoryProducts.flatMap(p => p.variants.map(v => v.id));

        if (variantIds.length > 0) {
          // Delete stock adjustments
          await tx.stockAdjustment.deleteMany({
            where: { productVariantId: { in: variantIds } }
          });

          // Delete variants
          await tx.productVariant.deleteMany({
            where: { id: { in: variantIds } }
          });
        }

        // Delete products
        const productsResult = await tx.product.deleteMany({
          where: { categoryId: { in: categoryIds } }
        });
        totalProductsDeleted = productsResult.count;
      }

      // Delete categories
      const categoriesResult = await tx.category.deleteMany({
        where: { 
          id: { in: categoryIds },
          tenantId 
        }
      });

      return {
        deletedCount: categoriesResult.count,
        productsDeleted: totalProductsDeleted
      };
    });

    // Clear category cache
    const { clearCategoryCache } = await import('../lib/cache.js');
    for (const id of categoryIds) {
      await clearCategoryCache(tenantId, id);
    }

    logger.info('Bulk delete categories', {
      tenantId,
      categoriesDeleted: deletedCount,
      productsDeleted,
    });

    return c.json({ 
      message: 'Bulk delete categories completed',
      categoriesDeleted: deletedCount,
      productsDeleted,
    });
  } catch (error: any) {
    logError(error, { context: 'Bulk delete categories' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

export default products;
