import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOnly, ownerOrManager } from '../middleware/auth.js';
import { rateLimiter, strictRateLimiter } from '../middleware/rate-limit.js';
import { logError } from '../lib/logger.js';
import { ERR, MSG } from '../lib/messages.js';
import { validate, createChannelSchema, updateChannelSchema, channelStockAllocationSchema } from '../lib/validators.js';

const channels = new Hono();

// GET /api/channels/stats/summary - Get channel statistics
// NOTE: This route MUST be defined BEFORE /:id to avoid being caught by it
channels.get('/stats/summary', authMiddleware, async (c) => {
  try {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const allChannels = await prisma.salesChannel.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { transactions: true }
        }
      }
    });

    // Get transaction stats per channel
    const stats = await Promise.all(
      allChannels.map(async (channel) => {
        const where: { channelId: string; createdAt?: { gte?: Date; lte?: Date } } = { channelId: channel.id };
        if (startDate || endDate) {
          where.createdAt = dateFilter;
        }

        const transactions = await prisma.transaction.aggregate({
          where,
          _count: true,
          _sum: { total: true }
        });

        return {
          id: channel.id,
          code: channel.code,
          name: channel.name,
          type: channel.type,
          icon: channel.icon,
          color: channel.color,
          transactionCount: transactions._count || 0,
          totalRevenue: transactions._sum.total || 0
        };
      })
    );

    return c.json(stats);
  } catch (error) {
    logError(error, { context: 'Fetch channel stats' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// GET /api/channels - Get all sales channels
channels.get('/', authMiddleware, async (c) => {
  try {
    const includeInactive = c.req.query('includeInactive');

    const where: { isActive?: boolean } = {};
    if (!includeInactive) {
      where.isActive = true;
    }

    const allChannels = await prisma.salesChannel.findMany({
      where,
      orderBy: [
        { isBuiltIn: 'desc' },
        { name: 'asc' }
      ]
    });

    return c.json(allChannels);
  } catch (error) {
    logError(error, { context: 'Fetch channels' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// GET /api/channels/:id - Get channel by ID
channels.get('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');

    const channel = await prisma.salesChannel.findUnique({
      where: { id },
      include: {
        _count: {
          select: { transactions: true, channelStocks: true }
        }
      }
    });

    if (!channel) {
      return c.json({ error: ERR.CHANNEL_NOT_FOUND }, 404);
    }

    return c.json(channel);
  } catch (error) {
    logError(error, { context: 'Fetch channel' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// POST /api/channels - Create new channel (OWNER/MANAGER only)
// Rate limited: 10 channels per 15 minutes
channels.post('/', rateLimiter({ max: 10 }), authMiddleware, ownerOrManager, async (c) => {
  try {
    const body = await c.req.json();
    
    // Zod validation
    const validation = validate(createChannelSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const { code, name, type, icon, color, apiConfig, fieldMapping } = validation.data;

    // Check if code already exists
    const existing = await prisma.salesChannel.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (existing) {
      return c.json({ error: ERR.CHANNEL_CODE_EXISTS }, 400);
    }

    const channel = await prisma.salesChannel.create({
      data: {
        code: code.toUpperCase(),
        name,
        type: type || 'MARKETPLACE',
        icon,
        color,
        apiConfig: apiConfig ?? Prisma.JsonNull,
        fieldMapping: fieldMapping ?? Prisma.JsonNull,
        isBuiltIn: false
      }
    });

    return c.json(channel, 201);
  } catch (error) {
    logError(error, { context: 'Create channel' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// PUT /api/channels/:id - Update channel
channels.put('/:id', authMiddleware, ownerOrManager, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    
    // Zod validation
    const validation = validate(updateChannelSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const { name, type, icon, color, isActive, apiConfig, fieldMapping } = validation.data;

    const channel = await prisma.salesChannel.findUnique({ where: { id } });

    if (!channel) {
      return c.json({ error: ERR.CHANNEL_NOT_FOUND }, 404);
    }

    // Cannot modify built-in channel's code
    const updated = await prisma.salesChannel.update({
      where: { id },
      data: {
        name: name ?? channel.name,
        type: type ?? channel.type,
        icon: icon !== undefined ? icon : channel.icon,
        color: color !== undefined ? color : channel.color,
        isActive: isActive !== undefined ? isActive : channel.isActive,
        apiConfig: apiConfig !== undefined ? (apiConfig ?? Prisma.JsonNull) : undefined,
        fieldMapping: fieldMapping !== undefined ? (fieldMapping ?? Prisma.JsonNull) : undefined
      }
    });

    return c.json(updated);
  } catch (error) {
    logError(error, { context: 'Update channel' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// DELETE /api/channels/:id - Delete channel (soft delete by setting isActive = false)
// Rate limited: 5 deletions per 15 minutes
channels.delete('/:id', strictRateLimiter({ max: 5 }), authMiddleware, ownerOnly, async (c) => {
  try {
    const id = c.req.param('id');

    const channel = await prisma.salesChannel.findUnique({ where: { id } });

    if (!channel) {
      return c.json({ error: ERR.CHANNEL_NOT_FOUND }, 404);
    }

    if (channel.isBuiltIn) {
      return c.json({ error: 'Channel bawaan tidak bisa dihapus' }, 400);
    }

    // Check if channel has transactions
    const txCount = await prisma.transaction.count({
      where: { channelId: id }
    });

    if (txCount > 0) {
      // Soft delete
      await prisma.salesChannel.update({
        where: { id },
        data: { isActive: false }
      });
      return c.json({ message: 'Channel dinonaktifkan (memiliki transaksi)' });
    } else {
      // Hard delete
      await prisma.salesChannel.delete({ where: { id } });
      return c.json({ message: 'Channel berhasil dihapus' });
    }
  } catch (error) {
    logError(error, { context: 'Delete channel' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// ==================== CHANNEL STOCK ALLOCATION ====================

// GET /api/channels/:channelId/stocks - Get stock allocation for a channel
channels.get('/:channelId/stocks', authMiddleware, async (c) => {
  try {
    const channelId = c.req.param('channelId');
    const productId = c.req.query('productId');
    const search = c.req.query('search');

    const where = { channelId };

    const stocks = await prisma.channelStock.findMany({
      where,
      include: {
        productVariant: {
          include: {
            product: {
              select: { id: true, name: true, category: { select: { name: true } } }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Filter by product name/sku if search provided
    let filtered = stocks;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = stocks.filter(s =>
        s.productVariant.product.name.toLowerCase().includes(searchLower) ||
        s.productVariant.sku.toLowerCase().includes(searchLower)
      );
    }

    if (productId) {
      filtered = filtered.filter(s => s.productVariant.productId === productId);
    }

    return c.json(filtered);
  } catch (error) {
    logError(error, { context: 'Fetch channel stocks' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// POST /api/channels/:channelId/stocks - Allocate stock to channel
channels.post('/:channelId/stocks', authMiddleware, ownerOrManager, async (c) => {
  try {
    const channelId = c.req.param('channelId');
    const body = await c.req.json();
    
    // Zod validation
    const validation = validate(channelStockAllocationSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const { variantId, allocatedQty } = validation.data;

    // Check channel exists
    const channel = await prisma.salesChannel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return c.json({ error: ERR.CHANNEL_NOT_FOUND }, 404);
    }

    // Upsert channel stock
    const channelStock = await prisma.channelStock.upsert({
      where: {
        channelId_productVariantId: {
          channelId,
          productVariantId: variantId
        }
      },
      update: {
        allocatedQty: allocatedQty
      },
      create: {
        channelId,
        productVariantId: variantId,
        allocatedQty
      },
      include: {
        productVariant: {
          include: {
            product: { select: { name: true } }
          }
        }
      }
    });

    return c.json(channelStock);
  } catch (error) {
    logError(error, { context: 'Allocate channel stock' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// PUT /api/channels/:channelId/stocks/:variantId - Update stock allocation
channels.put('/:channelId/stocks/:variantId', authMiddleware, ownerOrManager, async (c) => {
  try {
    const channelId = c.req.param('channelId');
    const variantId = c.req.param('variantId');
    const body = await c.req.json();
    const { allocatedQty, reservedQty, isActive } = body;

    const updated = await prisma.channelStock.update({
      where: {
        channelId_productVariantId: {
          channelId,
          productVariantId: variantId
        }
      },
      data: {
        ...(allocatedQty !== undefined && { allocatedQty }),
        ...(reservedQty !== undefined && { reservedQty }),
        ...(isActive !== undefined && { isActive })
      },
      include: {
        productVariant: {
          include: {
            product: { select: { name: true } }
          }
        }
      }
    });

    return c.json(updated);
  } catch (error) {
    logError(error, { context: 'Update channel stock' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// POST /api/channels/:channelId/stocks/bulk - Bulk allocate stocks
channels.post('/:channelId/stocks/bulk', authMiddleware, ownerOrManager, async (c) => {
  try {
    const channelId = c.req.param('channelId');
    const body = await c.req.json();
    const { allocations } = body; // [{ variantId, allocatedQty }, ...]

    if (!allocations || !Array.isArray(allocations)) {
      return c.json({ error: ERR.REQUIRED_FIELDS }, 400);
    }

    const results = await prisma.$transaction(
      allocations.map(({ variantId, allocatedQty }: { variantId: string; allocatedQty: number }) =>
        prisma.channelStock.upsert({
          where: {
            channelId_productVariantId: {
              channelId,
              productVariantId: variantId
            }
          },
          update: { allocatedQty },
          create: {
            channelId,
            productVariantId: variantId,
            allocatedQty
          }
        })
      )
    );

    return c.json({ message: `${results.length} stok berhasil dialokasikan`, data: results });
  } catch (error) {
    logError(error, { context: 'Bulk allocate stocks' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

export default channels;
