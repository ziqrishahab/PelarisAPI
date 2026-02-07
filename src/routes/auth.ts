import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { generateToken } from '../lib/jwt.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';
import { rateLimiter, strictRateLimiter, loginRateLimiter, incrementFailedLogin, resetLoginRateLimit } from '../middleware/rate-limit.js';
import logger, { logAuth, logError } from '../lib/logger.js';
import { validate, loginSchema, registerSchema, createUserSchema, updateUserSchema } from '../lib/validators.js';
import { ERR, MSG } from '../lib/messages.js';
import { createAuditLog } from '../lib/audit.js';
import config from '../config/index.js';

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

    const authUser = c.get('user');
    let tenantId: string | undefined = undefined;
    if (authUser && authUser.tenantId) tenantId = authUser.tenantId;

    // Check existing user scoped to tenant if tenantId present, otherwise global
    const existingUser = tenantId
      ? await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } } })
      : await prisma.user.findFirst({ where: { email } });

    if (existingUser) {
      return c.json({ error: 'Email sudah terdaftar' }, 400);
    }

    const hashedPassword = await bcrypt.hash(password, config.security.bcryptSaltRounds);

    // Use transaction for atomic user + cabang + printer settings creation
    const result = await prisma.$transaction(async (tx) => {
      // If no cabangId provided and storeName is provided, create default cabang
      let finalCabangId = cabangId;
      if (!finalCabangId && storeName) {
        // If no tenantId yet (public register), create tenant first
        if (!tenantId) {
          // Generate unique slug with timestamp to avoid collision
          const baseSlug = storeName?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'toko';
          const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;
          
          const newTenant = await tx.tenant.create({
            data: {
              name: storeName || 'Toko',
              slug: uniqueSlug,
            }
          });
          tenantId = newTenant.id;
        }

        const newCabang = await tx.cabang.create({
          data: {
            name: branchName || 'Pusat',
            address: null,
            phone: null,
            tenantId: tenantId
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
          cabangId: finalCabangId || null,
          tenantId: tenantId!
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

    // Generate CSRF token for cookie-based auth
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const token = generateToken(user.id, user.email, user.role, finalCabangId, tenantId, csrfToken);

    // Set HttpOnly cookie (best effort, frontend masih bisa pakai token di body)
    setCookie(c, 'token', token, {
      httpOnly: true,
      secure: config.env.IS_PROD,
      sameSite: 'Lax',
      path: '/',
      maxAge: config.security.jwtCookieMaxAge,
    });

    return c.json({ message: 'User berhasil dibuat', user, token, csrfToken, storeName }, 201);
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

    const user = await prisma.user.findFirst({
      where: { email },
      include: {
        cabang: {
          select: { id: true, name: true }
        }
      }
    });

    // Get IP for rate limiting
    const { getClientIP } = await import('../lib/utils.js');
    const ip = getClientIP(c);

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

    // Generate CSRF token for cookie-based auth
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const token = generateToken(user.id, user.email, user.role, user.cabangId, user.tenantId, csrfToken);
    const { password: _, ...userWithoutPassword } = user;

    // Get storeName from printer settings or tenant name
    let storeName = 'Toko Saya'; // fallback default
    if (user.cabangId) {
      const printerSettings = await prisma.printerSettings.findUnique({
        where: { cabangId: user.cabangId },
        select: { storeName: true }
      });
      if (printerSettings?.storeName) {
        storeName = printerSettings.storeName;
      }
    }
    // Fallback to tenant name if no printer settings
    if (storeName === 'Toko Saya' && user.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true }
      });
      if (tenant?.name) {
        storeName = tenant.name;
      }
    }

    // Log successful login
    logAuth('login', user.id, user.email, true, ip);

    // Set HttpOnly cookie (best effort)
    setCookie(c, 'token', token, {
      httpOnly: true,
      secure: config.env.IS_PROD,
      sameSite: 'Lax',
      path: '/',
      maxAge: config.security.jwtCookieMaxAge,
    });

    return c.json({ message: 'Login berhasil', user: { ...userWithoutPassword, storeName }, token, csrfToken });
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
        cabangId: true,
        hasMultiCabangAccess: true,
        cabang: {
          select: { id: true, name: true, address: true, phone: true }
        },
        createdAt: true
      }
    });

    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    // Get storeName from printer settings or tenant name
    let storeName = 'Toko Saya'; // fallback default
    if (user.cabang?.id) {
      const printerSettings = await prisma.printerSettings.findUnique({
        where: { cabangId: user.cabang.id },
        select: { storeName: true }
      });
      if (printerSettings?.storeName) {
        storeName = printerSettings.storeName;
      }
    }
    // Fallback to tenant name
    if (storeName === 'Toko Saya') {
      const authUser = c.get('user');
      if (authUser?.tenantId) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: authUser.tenantId },
          select: { name: true }
        });
        if (tenant?.name) {
          storeName = tenant.name;
        }
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
  // Clear HttpOnly cookie if present
  setCookie(c, 'token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  });

  return c.json({ message: 'Logout berhasil' });
});

// Get all users (Owner only)
auth.get('/users', authMiddleware, ownerOnly, async (c) => {
  try {
    // reuse authUser from earlier in this handler
    const tid = c.get('user')?.tenantId;
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        cabangId: true,
        hasMultiCabangAccess: true,
        cabang: {
          select: { id: true, name: true }
        },
        createdAt: true,
        updatedAt: true
      },
      where: tid ? { tenantId: tid } : undefined,
      orderBy: { createdAt: 'desc' }
    });

    return c.json(users);
  } catch (error) {
    logError(error, { context: 'Get users' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Create user (Owner only)
// Rate limited: 10 user creations per 15 minutes
auth.post('/users', rateLimiter({ max: 10 }), authMiddleware, ownerOnly, async (c) => {
  try {
    const authUser = c.get('user');
    const tenantId = authUser?.tenantId;

    const body = await c.req.json();
    
    // Zod validation
    const validation = validate(createUserSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const { email, password, name, role, cabangId, hasMultiCabangAccess } = validation.data;

    // Validation logic
    if (role === 'KASIR') {
      // KASIR must have cabangId, cannot have multi-cabang access
      if (!cabangId) {
        return c.json({ error: 'cabangId wajib diisi untuk role KASIR' }, 400);
      }
      if (hasMultiCabangAccess) {
        return c.json({ error: 'KASIR tidak boleh memiliki akses multi-cabang' }, 400);
      }
    } else if (role === 'ADMIN' || role === 'MANAGER') {
      // ADMIN/MANAGER can choose: tied to 1 cabang OR multi-cabang access
      if (!hasMultiCabangAccess && !cabangId) {
        return c.json({ error: 'Pilih cabang spesifik atau aktifkan akses multi-cabang' }, 400);
      }
    }
    // OWNER always has multi-cabang access (enforced below)

    if (!tenantId) return c.json({ error: 'Missing tenant scope' }, 400);
    const existingUser = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenantId, email } }
    });

    if (existingUser) {
      return c.json({ error: 'Email sudah terdaftar' }, 400);
    }

    const hashedPassword = await bcrypt.hash(password, config.security.bcryptSaltRounds);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        cabangId: hasMultiCabangAccess ? null : cabangId, // If multi-cabang, set cabangId to null
        hasMultiCabangAccess: role === 'OWNER' ? true : (hasMultiCabangAccess || false), // OWNER always true
        tenantId: tenantId!
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        hasMultiCabangAccess: true,
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
// Rate limited: 20 updates per 15 minutes
auth.put('/users/:id', rateLimiter({ max: 20 }), authMiddleware, ownerOnly, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    
    // Zod validation
    const validation = validate(updateUserSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const { name, role, cabangId, password, isActive, hasMultiCabangAccess } = validation.data;

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

    // Multi-cabang access logic
    if (hasMultiCabangAccess !== undefined) {
      // Validation
      if (role === 'KASIR' && hasMultiCabangAccess) {
        return c.json({ error: 'KASIR tidak boleh memiliki akses multi-cabang' }, 400);
      }
      
      updateData.hasMultiCabangAccess = role === 'OWNER' ? true : hasMultiCabangAccess;
      
      // If multi-cabang access enabled, clear cabangId
      if (hasMultiCabangAccess) {
        updateData.cabangId = null;
      }
    }

    // Only update cabangId if explicitly provided in request
    if (cabangId !== undefined && !updateData.hasMultiCabangAccess) {
      const normalizedCabangId = cabangId === '' ? null : cabangId;
      
      // Validate: KASIR must have cabangId
      if (role === 'KASIR' && !normalizedCabangId) {
        return c.json({ error: 'cabangId wajib diisi untuk role KASIR' }, 400);
      }
      
      // Validate: ADMIN/MANAGER must choose between cabangId or multi-cabang
      if ((role === 'ADMIN' || role === 'MANAGER') && !normalizedCabangId && !hasMultiCabangAccess) {
        return c.json({ error: 'Pilih cabang spesifik atau aktifkan akses multi-cabang' }, 400);
      }
      
      updateData.cabangId = normalizedCabangId;
    }

    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, config.security.bcryptSaltRounds);
    }

    const user = await prisma.user.update({
      where: { id },
      data: { ...updateData },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        hasMultiCabangAccess: true,
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
// Rate limited: 5 deletions per 15 minutes
auth.delete('/users/:id', strictRateLimiter({ max: 5 }), authMiddleware, ownerOnly, async (c) => {
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

      // Audit log for soft delete
      void createAuditLog({
        action: 'USER_SOFT_DELETED',
        entityType: 'User',
        entityId: id,
        description: `User ${user.name} (${user.email}) deactivated due to transaction history`,
        metadata: { 
          transactionCount: user._count.transactions,
          returnCount: user._count.processedReturns 
        },
        context: { user: authUser }
      });

      return c.json({
        message: 'User memiliki riwayat transaksi. User telah dinonaktifkan.',
        action: 'deactivated'
      });
    }

    await prisma.user.delete({
      where: { id }
    });

    // Audit log for hard delete
    void createAuditLog({
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: id,
      description: `User ${user.name} (${user.email}) permanently deleted`,
      context: { user: authUser }
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

// Forgot Password - Request reset token
auth.post('/forgot-password', strictRateLimiter({ max: isDev ? 20 : 3 }), async (c) => {
  try {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: 'Email wajib diisi' }, 400);
    }

    // Find user by email
    const user = await prisma.user.findFirst({
      where: { email }
    });

    // Always return success to prevent email enumeration
    if (!user) {
      logger.info('[Auth] Forgot password request for non-existent email', { email });
      return c.json({ 
        message: 'Jika email terdaftar, link reset password akan dikirim',
        success: true 
      });
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing reset tokens for this email
    await prisma.passwordReset.deleteMany({
      where: { email }
    });

    // Create new reset token
    await prisma.passwordReset.create({
      data: {
        email,
        token,
        expiresAt
      }
    });

    logger.info('[Auth] Password reset token generated', { email, userId: user.id });

    // Return token and user info for frontend to send email via EmailJS
    return c.json({ 
      message: 'Jika email terdaftar, link reset password akan dikirim',
      success: true,
      // These are returned for EmailJS to send the email
      resetData: {
        token,
        name: user.name,
        email: user.email
      }
    });
  } catch (error: any) {
    logError(error, { context: 'Forgot password' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Reset Password - Verify token and update password
auth.post('/reset-password', strictRateLimiter({ max: isDev ? 20 : 5 }), async (c) => {
  try {
    const { token, password } = await c.req.json();

    if (!token || !password) {
      return c.json({ error: 'Token dan password wajib diisi' }, 400);
    }

    // Validate password strength
    if (password.length < 8) {
      return c.json({ error: 'Password minimal 8 karakter' }, 400);
    }
    if (!/[a-z]/.test(password)) {
      return c.json({ error: 'Password harus mengandung huruf kecil' }, 400);
    }
    if (!/[A-Z]/.test(password)) {
      return c.json({ error: 'Password harus mengandung huruf besar' }, 400);
    }
    if (!/[0-9]/.test(password)) {
      return c.json({ error: 'Password harus mengandung angka' }, 400);
    }

    // Find valid reset token
    const resetToken = await prisma.passwordReset.findUnique({
      where: { token }
    });

    if (!resetToken) {
      return c.json({ error: 'Token tidak valid' }, 400);
    }

    if (resetToken.used) {
      return c.json({ error: 'Token sudah digunakan' }, 400);
    }

    if (resetToken.expiresAt < new Date()) {
      return c.json({ error: 'Token sudah kadaluarsa' }, 400);
    }

    // Find user
    const user = await prisma.user.findFirst({
      where: { email: resetToken.email }
    });

    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    // Update password
    const hashedPassword = await bcrypt.hash(password, config.security.bcryptSaltRounds);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    // Mark token as used
    await prisma.passwordReset.update({
      where: { token },
      data: { used: true }
    });

    logger.info('[Auth] Password reset successful', { email: user.email, userId: user.id });

    return c.json({ 
      message: 'Password berhasil direset',
      success: true 
    });
  } catch (error: any) {
    logError(error, { context: 'Reset password' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

export default auth;
