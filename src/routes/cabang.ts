import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';
import { rateLimiter, strictRateLimiter } from '../middleware/rate-limit.js';
import { logError } from '../lib/logger.js';
import { validate, createCabangSchema, updateCabangSchema } from '../lib/validators.js';
import { ERR, MSG } from '../lib/messages.js';

const cabang = new Hono();

// Get all cabangs
cabang.get('/', authMiddleware, async (c) => {
  try {
    const authUser = c.get('user');
    const tenantId: string | undefined = authUser && authUser.tenantId ? authUser.tenantId : undefined;

    const cabangs = await prisma.cabang.findMany({
      include: {
        _count: {
          select: {
            users: true,
            stocks: true,
            transactions: true
          }
        }
      },
      where: tenantId ? { tenantId } : undefined,
      orderBy: { name: 'asc' }
    });
    return c.json(cabangs);
  } catch (error) {
    logError(error, { context: 'Get cabangs' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Get single cabang
cabang.get('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const result = await prisma.cabang.findUnique({
      where: { id },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true }
        },
        _count: {
          select: {
            stocks: true,
            transactions: true
          }
        }
      }
    });

    if (!result) {
      return c.json({ error: ERR.CABANG_NOT_FOUND }, 404);
    }

    return c.json(result);
  } catch (error) {
    logError(error, { context: 'Get cabang' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Create cabang (Owner only)
// Rate limited: 5 branches per 15 minutes
cabang.post('/', rateLimiter({ max: 5 }), authMiddleware, ownerOnly, async (c) => {
  try {
    const authUser = c.get('user');
    const tenantId = authUser?.tenantId;

    const body = await c.req.json();
    const validation = validate(createCabangSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const { name, address, phone } = validation.data;

    if (!tenantId) return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    const result = await prisma.cabang.create({
      data: { name, address, phone, tenantId: tenantId }
    });

    return c.json(result, 201);
  } catch (error: any) {
    logError(error, { context: 'Create cabang' });
    if (error.code === 'P2002') {
      return c.json({ error: ERR.CABANG_EXISTS }, 400);
    }
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Update cabang (Owner only)
cabang.put('/:id', authMiddleware, ownerOnly, async (c) => {
  try {
    const id = c.req.param('id');
    const authUser = c.get('user');
    const tenantId: string | undefined = authUser && authUser.tenantId ? authUser.tenantId : undefined;

    const body = await c.req.json();
    const validation = validate(updateCabangSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const { name, address, phone, isActive } = validation.data;

    if (!tenantId) return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    const result = await prisma.cabang.update({
      where: { id },
      data: { name, address, phone, isActive, tenantId: tenantId }
    });

    return c.json(result);
  } catch (error: any) {
    logError(error, { context: 'Update cabang' });
    if (error.code === 'P2025') {
      return c.json({ error: ERR.CABANG_NOT_FOUND }, 404);
    }
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// Delete cabang (Owner only)
// Rate limited: 3 deletions per 15 minutes (sensitive operation)
cabang.delete('/:id', strictRateLimiter({ max: 3 }), authMiddleware, ownerOnly, async (c) => {
  try {
    const id = c.req.param('id');

    // Use transaction to ensure atomic operation
    const authUser = c.get('user');
    const tenantId = authUser?.tenantId;

    const result = await prisma.$transaction(async (tx) => {
      const cabangData = await tx.cabang.findFirst({
        where: { id, tenantId: tenantId! },
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          tenantId: true,
          address: true,
          phone: true,
          _count: {
            select: { users: true, stocks: true, transactions: true }
          }
        }
      });

      if (!cabangData) {
        throw new Error('NOT_FOUND');
      }

      const usersCount = cabangData._count?.users ?? 0;
      const stocksCount = cabangData._count?.stocks ?? 0;
      const transactionsCount = cabangData._count?.transactions ?? 0;

      if (usersCount > 0) {
        throw new Error(`Tidak bisa hapus cabang. Masih ada ${usersCount} user. Pindahkan atau hapus user terlebih dahulu.`);
      }

      if (stocksCount > 0) {
        throw new Error(`Tidak bisa hapus cabang. Masih ada ${stocksCount} stok. Pindahkan atau hapus stok terlebih dahulu.`);
      }

      if (transactionsCount > 0) {
        const updated = await tx.cabang.update({
          where: { id },
          data: { isActive: false }
        });

        return {
          message: 'Cabang memiliki riwayat transaksi. Cabang telah dinonaktifkan.',
          action: 'deactivated' as const,
          cabang: updated
        };
      }

      await tx.cabang.delete({ where: { id } });

      return {
        message: MSG.CABANG_DELETED,
        action: 'deleted' as const,
        cabang: null
      };
    });

    return c.json(result);
  } catch (error: any) {
    logError(error, { context: 'Delete cabang' });
    if (error.message === 'NOT_FOUND') {
      return c.json({ error: ERR.CABANG_NOT_FOUND }, 404);
    }
    if (error.message.startsWith('Tidak bisa hapus cabang')) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

export default cabang;
