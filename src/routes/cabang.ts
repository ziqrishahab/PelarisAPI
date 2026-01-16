import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';
import { logError } from '../lib/logger.js';
import { validate, createCabangSchema, updateCabangSchema } from '../lib/validators.js';

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
    return c.json({ error: 'Internal server error' }, 500);
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
      return c.json({ error: 'Cabang not found' }, 404);
    }

    return c.json(result);
  } catch (error) {
    logError(error, { context: 'Get cabang' });
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create cabang (Owner only)
cabang.post('/', authMiddleware, ownerOnly, async (c) => {
  try {
    const authUser = c.get('user');
    const tenantId = authUser?.tenantId;

    const body = await c.req.json();
    const validation = validate(createCabangSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const { name, address, phone } = validation.data;

    if (!tenantId) return c.json({ error: 'Missing tenant scope' }, 400);
    const result = await prisma.cabang.create({
      data: { name, address, phone, tenantId: tenantId }
    });

    return c.json(result, 201);
  } catch (error: any) {
    logError(error, { context: 'Create cabang' });
    if (error.code === 'P2002') {
      return c.json({ error: 'Cabang name already exists' }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
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

    if (!tenantId) return c.json({ error: 'Missing tenant scope' }, 400);
    const result = await prisma.cabang.update({
      where: { id },
      data: { name, address, phone, isActive, tenantId: tenantId }
    });

    return c.json(result);
  } catch (error: any) {
    logError(error, { context: 'Update cabang' });
    if (error.code === 'P2025') {
      return c.json({ error: 'Cabang not found' }, 404);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete cabang (Owner only)
cabang.delete('/:id', authMiddleware, ownerOnly, async (c) => {
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
        throw new Error('Cabang not found');
      }

      const usersCount = cabangData._count?.users ?? 0;
      const stocksCount = cabangData._count?.stocks ?? 0;
      const transactionsCount = cabangData._count?.transactions ?? 0;

      if (usersCount > 0) {
        throw new Error(`Cannot delete cabang. It has ${usersCount} user(s). Reassign or delete users first.`);
      }

      if (stocksCount > 0) {
        throw new Error(`Cannot delete cabang. It has ${stocksCount} stock record(s). Transfer or delete stocks first.`);
      }

      if (transactionsCount > 0) {
        const updated = await tx.cabang.update({
          where: { id },
          data: { isActive: false }
        });

        return {
          message: 'Cabang has transaction history. Cabang has been deactivated.',
          action: 'deactivated' as const,
          cabang: updated
        };
      }

      await tx.cabang.delete({ where: { id } });

      return {
        message: 'Cabang deleted successfully',
        action: 'deleted' as const,
        cabang: null
      };
    });

    return c.json(result);
  } catch (error: any) {
    logError(error, { context: 'Delete cabang' });
    if (error.message === 'Cabang not found') {
      return c.json({ error: 'Cabang not found' }, 404);
    }
    if (error.message.startsWith('Cannot delete cabang')) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default cabang;
