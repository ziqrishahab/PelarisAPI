/**
 * Customer Routes
 * CRUD operations for customer management
 */

import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOrManager } from '../middleware/auth.js';
import { ERR } from '../lib/messages.js';
import { logError } from '../lib/logger.js';

const customers = new Hono();

// ==================== LIST CUSTOMERS ====================
customers.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const search = c.req.query('search');
    const isActive = c.req.query('isActive');
    const sortBy = c.req.query('sortBy') || 'createdAt';
    const sortOrder = c.req.query('sortOrder') || 'desc';

    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [customers, totalCount] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
          totalSpent: true,
          totalOrders: true,
          points: true,
          notes: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { transactions: true }
          }
        }
      }),
      prisma.customer.count({ where })
    ]);

    return c.json({
      data: customers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error: any) {
    logError(error, { context: 'List customers' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// ==================== GET CUSTOMER BY ID ====================
customers.get('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const id = c.req.param('id');

    const customer = await prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            transactionNo: true,
            total: true,
            createdAt: true,
            status: true
          }
        }
      }
    });

    if (!customer) {
      return c.json({ error: 'Customer tidak ditemukan' }, 404);
    }

    return c.json(customer);
  } catch (error: any) {
    logError(error, { context: 'Get customer' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// ==================== SEARCH CUSTOMER BY PHONE ====================
customers.get('/search/phone', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const phone = c.req.query('phone');
    
    if (!phone || phone.length < 3) {
      return c.json({ data: [] });
    }

    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        phone: { contains: phone, mode: 'insensitive' },
        isActive: true
      },
      take: 10,
      select: {
        id: true,
        name: true,
        phone: true,
        totalSpent: true,
        totalOrders: true,
        points: true
      }
    });

    return c.json({ data: customers });
  } catch (error: any) {
    logError(error, { context: 'Search customer by phone' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// ==================== CREATE CUSTOMER ====================
customers.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const body = await c.req.json();
    const { name, phone, email, address, notes } = body;

    if (!name || name.trim().length === 0) {
      return c.json({ error: 'Nama customer wajib diisi' }, 400);
    }

    // Check duplicate phone if provided
    if (phone) {
      const existing = await prisma.customer.findFirst({
        where: { tenantId, phone }
      });
      if (existing) {
        return c.json({ error: 'Nomor telepon sudah terdaftar' }, 400);
      }
    }

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null
      }
    });

    return c.json(customer, 201);
  } catch (error: any) {
    logError(error, { context: 'Create customer' });
    if (error.code === 'P2002') {
      return c.json({ error: 'Nomor telepon sudah terdaftar' }, 400);
    }
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// ==================== UPDATE CUSTOMER ====================
customers.put('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const id = c.req.param('id');
    const body = await c.req.json();
    const { name, phone, email, address, notes, isActive } = body;

    // Check customer exists
    const existing = await prisma.customer.findFirst({
      where: { id, tenantId }
    });

    if (!existing) {
      return c.json({ error: 'Customer tidak ditemukan' }, 404);
    }

    // Check duplicate phone if changed
    if (phone && phone !== existing.phone) {
      const duplicate = await prisma.customer.findFirst({
        where: { tenantId, phone, id: { not: id } }
      });
      if (duplicate) {
        return c.json({ error: 'Nomor telepon sudah digunakan customer lain' }, 400);
      }
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name: name?.trim() || existing.name,
        phone: phone?.trim() || existing.phone,
        email: email?.trim() || existing.email,
        address: address?.trim() || existing.address,
        notes: notes?.trim() || existing.notes,
        isActive: isActive !== undefined ? isActive : existing.isActive
      }
    });

    return c.json(customer);
  } catch (error: any) {
    logError(error, { context: 'Update customer' });
    if (error.code === 'P2002') {
      return c.json({ error: 'Nomor telepon sudah terdaftar' }, 400);
    }
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// ==================== DELETE CUSTOMER ====================
customers.delete('/:id', authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const id = c.req.param('id');

    // Check customer exists
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { transactions: true } }
      }
    });

    if (!customer) {
      return c.json({ error: 'Customer tidak ditemukan' }, 404);
    }

    // If customer has transactions, deactivate instead of delete
    if (customer._count.transactions > 0) {
      await prisma.customer.update({
        where: { id },
        data: { isActive: false }
      });
      return c.json({ 
        message: 'Customer memiliki riwayat transaksi. Customer telah dinonaktifkan.',
        action: 'deactivated'
      });
    }

    await prisma.customer.delete({ where: { id } });
    
    return c.json({ message: 'Customer berhasil dihapus', action: 'deleted' });
  } catch (error: any) {
    logError(error, { context: 'Delete customer' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// ==================== GET CUSTOMER STATS ====================
customers.get('/:id/stats', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const id = c.req.param('id');

    const customer = await prisma.customer.findFirst({
      where: { id, tenantId }
    });

    if (!customer) {
      return c.json({ error: 'Customer tidak ditemukan' }, 404);
    }

    // Get transaction stats
    const transactions = await prisma.transaction.aggregate({
      where: { customerId: id },
      _sum: { total: true },
      _count: { id: true },
      _avg: { total: true }
    });

    // Get last transaction
    const lastTransaction = await prisma.transaction.findFirst({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        transactionNo: true,
        total: true,
        createdAt: true
      }
    });

    return c.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        points: customer.points
      },
      stats: {
        totalSpent: transactions._sum.total || 0,
        totalOrders: transactions._count.id || 0,
        averageOrder: transactions._avg.total || 0,
        lastTransaction
      }
    });
  } catch (error: any) {
    logError(error, { context: 'Get customer stats' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

export default customers;
