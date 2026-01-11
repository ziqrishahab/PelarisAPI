import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { generateToken } from '../lib/jwt.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';
import { strictRateLimiter, loginRateLimiter, incrementFailedLogin, resetLoginRateLimit } from '../middleware/rate-limit.js';
import logger, { logAuth, logError } from '../lib/logger.js';
import { validate, loginSchema, registerSchema } from '../lib/validators.js';

const auth = new Hono();

// Development mode - more lenient rate limits
const isDev = process.env.NODE_ENV === 'development';

// Register - with strict rate limiting (5 in prod, 50 in dev per 15 minutes)
auth.post('/register', strictRateLimiter({ max: isDev ? 50 : 5 }), async (c) => {
  try {
    const body = await c.req.json();

    // Zod validation
    const validation = validate(registerSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const { email, password, name, role, cabangId, storeName, branchName } = validation.data;

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return c.json({ error: 'Email sudah terdaftar' }, 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Use transaction for atomic user + cabang + printer settings creation
    const result = await prisma.$transaction(async (tx) => {
      // If no cabangId provided and storeName is provided, create default cabang
      let finalCabangId = cabangId;
      if (!finalCabangId && storeName) {
        const newCabang = await tx.cabang.create({
          data: {
            name: branchName || 'Pusat',
            address: null,
            phone: null
          }
        });
        finalCabangId = newCabang.id;

        // Create printer settings for the new cabang with store name
        await tx.printerSettings.create({
          data: {
            cabangId: finalCabangId,
            storeName: storeName,
            branchName: branchName || 'Pusat'
          }
        });
      }

      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: role || 'OWNER',
          cabangId: finalCabangId || null
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          cabang: {
            select: { id: true, name: true }
          }
        }
      });

      return { user, finalCabangId };
    });

    const { user, finalCabangId } = result;
    const token = generateToken(user.id, user.email, user.role, finalCabangId);

    return c.json({ message: 'User berhasil dibuat', user, token, storeName }, 201);
  } catch (error) {
    logError(error, { context: 'Register' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Login - with smart rate limiting (only counts failed attempts)
auth.post('/login', loginRateLimiter({ max: isDev ? 100 : 10 }), async (c) => {
  try {
    const body = await c.req.json();

    // Zod validation
    const validation = validate(loginSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const { email, password } = validation.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        cabang: {
          select: { id: true, name: true }
        }
      }
    });

    // Get IP for rate limiting
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() 
      || c.req.header('x-real-ip') 
      || c.req.header('cf-connecting-ip') 
      || 'unknown';

    if (!user) {
      // Increment failed login counter
      await incrementFailedLogin(ip);
      return c.json({ error: 'Email atau password salah' }, 401);
    }

    if (!user.isActive) {
      // Increment failed login counter
      await incrementFailedLogin(ip);
      return c.json({ error: 'Akun Anda tidak aktif' }, 401);
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      // Increment failed login counter
      await incrementFailedLogin(ip);
      return c.json({ error: 'Email atau password salah' }, 401);
    }

    // Login successful - reset rate limit counter
    await resetLoginRateLimit(ip);

    const token = generateToken(user.id, user.email, user.role, user.cabangId);
    const { password: _, ...userWithoutPassword } = user;

    // Get storeName from printer settings
    let storeName = 'Pelaris.id'; // default
    if (user.cabangId) {
      const printerSettings = await prisma.printerSettings.findUnique({
        where: { cabangId: user.cabangId },
        select: { storeName: true }
      });
      if (printerSettings?.storeName) {
        storeName = printerSettings.storeName;
      }
    }

    // Log successful login
    logAuth('login', user.id, user.email, true, ip);

    return c.json({ message: 'Login berhasil', user: { ...userWithoutPassword, storeName }, token });
  } catch (error) {
    logError(error, { context: 'Login' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Get current user
auth.get('/me', authMiddleware, async (c) => {
  try {
    const authUser = c.get('user');
    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabang: {
          select: { id: true, name: true, address: true, phone: true }
        },
        createdAt: true
      }
    });

    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    // Get storeName from printer settings (first cabang)
    let storeName = 'Pelaris.id'; // default
    if (user.cabang?.id) {
      const printerSettings = await prisma.printerSettings.findUnique({
        where: { cabangId: user.cabang.id },
        select: { storeName: true }
      });
      if (printerSettings?.storeName) {
        storeName = printerSettings.storeName;
      }
    }

    return c.json({ user: { ...user, storeName } });
  } catch (error) {
    logError(error, { context: 'Get user' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Logout
auth.post('/logout', authMiddleware, async (c) => {
  return c.json({ message: 'Logout berhasil' });
});

// Get all users (Owner only)
auth.get('/users', authMiddleware, ownerOnly, async (c) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabangId: true,
        cabang: {
          select: { id: true, name: true }
        },
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return c.json(users);
  } catch (error) {
    logError(error, { context: 'Get users' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Create user (Owner only)
auth.post('/users', authMiddleware, ownerOnly, async (c) => {
  try {
    const { email, password, name, role, cabangId } = await c.req.json();

    if (!email || !password || !name || !role) {
      return c.json({ error: 'Email, password, name, dan role wajib diisi' }, 400);
    }

    if (role !== 'ADMIN' && role !== 'OWNER' && !cabangId) {
      return c.json({ error: 'cabangId wajib diisi untuk role KASIR/MANAGER' }, 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return c.json({ error: 'Email sudah terdaftar' }, 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        cabangId
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabang: {
          select: { id: true, name: true }
        },
        createdAt: true
      }
    });

    return c.json({ message: 'User berhasil dibuat', user }, 201);
  } catch (error) {
    logError(error, { context: 'Create user' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Update user (Owner only)
auth.put('/users/:id', authMiddleware, ownerOnly, async (c) => {
  try {
    const id = c.req.param('id');
    const { name, role, cabangId, password, isActive } = await c.req.json();

    if (!name || !role) {
      return c.json({ error: 'Nama dan role wajib diisi' }, 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!existingUser) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    const updateData: any = {
      name,
      role,
      isActive: isActive !== undefined ? isActive : existingUser.isActive
    };

    // Only update cabangId if explicitly provided in request
    if (cabangId !== undefined) {
      // Convert empty string to null for OWNER/ADMIN
      const normalizedCabangId = cabangId === '' ? null : cabangId;
      
      // Validate: non-OWNER/ADMIN must have cabangId
      if (role !== 'OWNER' && role !== 'ADMIN' && !normalizedCabangId) {
        return c.json({ error: 'cabangId wajib diisi untuk role KASIR/MANAGER' }, 400);
      }
      
      updateData.cabangId = normalizedCabangId;
    }

    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabang: {
          select: { id: true, name: true }
        },
        updatedAt: true
      }
    });

    return c.json({ message: 'User berhasil diupdate', user });
  } catch (error) {
    logError(error, { context: 'Update user' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Delete user (Owner only)
auth.delete('/users/:id', authMiddleware, ownerOnly, async (c) => {
  try {
    const id = c.req.param('id');
    const authUser = c.get('user');

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            transactions: true,
            processedReturns: true
          }
        }
      }
    });

    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    if (user.id === authUser.userId) {
      return c.json({ error: 'Tidak bisa menghapus akun sendiri' }, 400);
    }

    if (user._count.transactions > 0 || user._count.processedReturns > 0) {
      await prisma.user.update({
        where: { id },
        data: { isActive: false }
      });

      return c.json({
        message: 'User memiliki riwayat transaksi. User telah dinonaktifkan.',
        action: 'deactivated'
      });
    }

    await prisma.user.delete({
      where: { id }
    });

    return c.json({ message: 'User berhasil dihapus', action: 'deleted' });
  } catch (error: any) {
    logError(error, { context: 'Delete user' });
    if (error.code === 'P2025') {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

export default auth;
