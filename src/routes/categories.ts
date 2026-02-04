/**
 * Categories Routes
 * 
 * Handles CRUD operations for product categories.
 * Extracted from products.ts for better maintainability.
 */

import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOrManager, type AuthUser } from '../middleware/auth.js';
import { emitCategoryUpdated } from '../lib/socket.js';
import { logError } from '../lib/logger.js';
import { validate, createCategorySchema, updateCategorySchema } from '../lib/validators.js';
import { ERR } from '../lib/messages.js';

type Variables = {
  user: AuthUser;
};

const categories = new Hono<{ Variables: Variables }>();

// Get all categories (with Redis caching)
categories.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    // Try cache first
    const { getCacheOrSet, CacheKeys, CACHE_TTL } = await import('../lib/cache.js');
    
    const categoriesList = await getCacheOrSet(
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
    
    return c.json(categoriesList);
  } catch (error) {
    logError(error, { context: 'Gagal mengambil kategori' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Create category (Owner/Manager only)
categories.post('/', authMiddleware, ownerOrManager, async (c) => {
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

    emitCategoryUpdated(category, tenantId);
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
categories.put('/:id', authMiddleware, ownerOrManager, async (c) => {
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

    emitCategoryUpdated(category, tenantId);
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
categories.delete('/:id', authMiddleware, ownerOrManager, async (c) => {
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

// Bulk delete categories
categories.post('/bulk-delete', authMiddleware, ownerOrManager, async (c) => {
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
    const categoriesList = await prisma.category.findMany({
      where: {
        id: { in: categoryIds },
        tenantId
      }
    });

    if (categoriesList.length !== categoryIds.length) {
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

export default categories;
