import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOnly, ownerOrManager } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rate-limit.js';
import { logError } from '../lib/logger.js';
import { validate, updateAppSettingsSchema, updatePrinterSettingsSchema, updateSettingsSchema } from '../lib/validators.js';

const settings = new Hono();

// ============ APP SETTINGS (Return/Exchange) ============
// Get app settings (global settings for return/exchange features)
settings.get('/app', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: 'Tenant scope required' }, 400);
    }

    // Get app settings from Settings model (key-value pairs) - tenant-scoped
    const settingsList = await prisma.settings.findMany({
      where: {
        tenantId,
        key: {
          in: ['returnEnabled', 'returnDeadlineDays', 'returnRequiresApproval', 'exchangeEnabled']
        }
      }
    });

    // Convert to object with defaults
    const appSettings: Record<string, any> = {
      returnEnabled: settingsList.find(s => s.key === 'returnEnabled')?.value === 'true' || false,
      returnDeadlineDays: parseInt(settingsList.find(s => s.key === 'returnDeadlineDays')?.value || '7'),
      returnRequiresApproval: settingsList.find(s => s.key === 'returnRequiresApproval')?.value === 'true' || true,
      exchangeEnabled: settingsList.find(s => s.key === 'exchangeEnabled')?.value === 'true' || false,
    };

    return c.json(appSettings);
  } catch (error) {
    logError(error, { context: 'Get app settings' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Update app settings (Owner only)
// Rate limited: 10 updates per 15 minutes
settings.put('/app', rateLimiter({ max: 10 }), authMiddleware, ownerOnly, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: 'Tenant scope required' }, 400);
    }

    const body = await c.req.json();
    const validation = validate(updateAppSettingsSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const { returnEnabled, returnDeadlineDays, returnRequiresApproval, exchangeEnabled } = validation.data;

    // Update settings using key-value pairs - tenant-scoped
    const updates = [];
    if (returnEnabled !== undefined) {
      updates.push(prisma.settings.upsert({
        where: { tenantId_key: { tenantId, key: 'returnEnabled' } },
        update: { value: String(returnEnabled) },
        create: { tenantId, key: 'returnEnabled', value: String(returnEnabled) }
      }));
    }
    if (returnDeadlineDays !== undefined) {
      updates.push(prisma.settings.upsert({
        where: { tenantId_key: { tenantId, key: 'returnDeadlineDays' } },
        update: { value: String(returnDeadlineDays) },
        create: { tenantId, key: 'returnDeadlineDays', value: String(returnDeadlineDays) }
      }));
    }
    if (returnRequiresApproval !== undefined) {
      updates.push(prisma.settings.upsert({
        where: { tenantId_key: { tenantId, key: 'returnRequiresApproval' } },
        update: { value: String(returnRequiresApproval) },
        create: { tenantId, key: 'returnRequiresApproval', value: String(returnRequiresApproval) }
      }));
    }
    if (exchangeEnabled !== undefined) {
      updates.push(prisma.settings.upsert({
        where: { tenantId_key: { tenantId, key: 'exchangeEnabled' } },
        update: { value: String(exchangeEnabled) },
        create: { tenantId, key: 'exchangeEnabled', value: String(exchangeEnabled) }
      }));
    }

    await Promise.all(updates);

    return c.json({ 
      message: 'App settings berhasil diupdate'
    });
  } catch (error) {
    logError(error, { context: 'Update app settings' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// ============ PRINTER SETTINGS ============
// IMPORTANT: These routes MUST be defined BEFORE /:key route to avoid being caught by it

// Get printer settings by cabang
settings.get('/printer', authMiddleware, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');

    if (!cabangId) {
      return c.json({ error: 'cabangId diperlukan' }, 400);
    }

    let printerSettings = await prisma.printerSettings.findUnique({
      where: { cabangId }
    });

    // Create default if not exists
    if (!printerSettings) {
      printerSettings = await prisma.printerSettings.create({
        data: { cabangId }
      });
    }

    return c.json(printerSettings);
  } catch (error) {
    logError(error, { context: 'Get printer settings' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Update printer settings (Owner/Manager only)
// Rate limited: 10 updates per 15 minutes
settings.put('/printer', rateLimiter({ max: 10 }), authMiddleware, ownerOrManager, async (c) => {
  try {
    const body = await c.req.json();
    const validation = validate(updatePrinterSettingsSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const { cabangId, ...data } = validation.data; // Exclude storeName from update (not in schema)

    // Verify cabangId exists before upsert
    const cabangExists = await prisma.cabang.findUnique({
      where: { id: cabangId }
    });

    if (!cabangExists) {
      return c.json({
        error: 'Cabang tidak ditemukan',
        detail: `cabangId ${cabangId} tidak ada di database`
      }, 404);
    }

    // Note: storeName is excluded from update - only editable by admin via database
    const printerSettings = await prisma.printerSettings.upsert({
      where: { cabangId },
      update: data,
      create: { cabangId, ...data }
    });

    return c.json({ message: 'Printer settings berhasil disimpan', settings: printerSettings });
  } catch (error) {
    logError(error, { context: 'Update printer settings' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// ============ GENERAL SETTINGS ============

// Get all settings
settings.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: 'Tenant scope required' }, 400);
    }

    const allSettings = await prisma.settings.findMany({
      where: { tenantId }
    });

    // Convert to object format
    const settingsObj: Record<string, string> = {};
    allSettings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });

    return c.json(settingsObj);
  } catch (error) {
    logError(error, { context: 'Get settings' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Update or create settings (Owner only)
settings.put('/', authMiddleware, ownerOnly, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: 'Tenant scope required' }, 400);
    }

    const body = await c.req.json();
    const validation = validate(updateSettingsSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }

    const settingsData = validation.data; // { lowStockThreshold: '5', criticalStockThreshold: '2' }

    const promises = Object.entries(settingsData).map(([key, value]) => {
      return prisma.settings.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: { value: String(value) },
        create: { tenantId, key, value: String(value) }
      });
    });

    await Promise.all(promises);

    return c.json({ message: 'Settings berhasil diupdate' });
  } catch (error) {
    logError(error, { context: 'Update settings' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Get specific setting by key - MUST be last because /:key matches everything
settings.get('/:key', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: 'Tenant scope required' }, 400);
    }

    const key = c.req.param('key');
    const setting = await prisma.settings.findUnique({
      where: { tenantId_key: { tenantId, key } }
    });

    if (!setting) {
      return c.json({ error: 'Setting tidak ditemukan' }, 404);
    }

    return c.json({ key: setting.key, value: setting.value });
  } catch (error) {
    logError(error, { context: 'Get setting by key' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// ============ TENANT NAME MANAGEMENT ============
// Get tenant info (name & last change date)
settings.get('/tenant', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: 'Tenant scope required' }, 400);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, lastNameChangeAt: true, createdAt: true }
    });

    if (!tenant) {
      return c.json({ error: 'Tenant tidak ditemukan' }, 404);
    }

    // Calculate if name can be changed (30 days = 2592000000ms)
    const canChangeName = !tenant.lastNameChangeAt || 
      (Date.now() - tenant.lastNameChangeAt.getTime()) >= 2592000000;
    
    const daysUntilNextChange = tenant.lastNameChangeAt 
      ? Math.max(0, 30 - Math.floor((Date.now() - tenant.lastNameChangeAt.getTime()) / 86400000))
      : 0;

    return c.json({
      ...tenant,
      canChangeName,
      daysUntilNextChange
    });
  } catch (error) {
    logError(error, { context: 'Get tenant info' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

// Update tenant name (Owner only, max once per 30 days)
// Rate limited: 3 attempts per 15 minutes
settings.put('/tenant/name', rateLimiter({ max: 3 }), authMiddleware, ownerOnly, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    
    if (!tenantId) {
      return c.json({ error: 'Tenant scope required' }, 400);
    }

    const body = await c.req.json();
    const { name } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ error: 'Nama tenant tidak valid' }, 400);
    }

    if (name.trim().length > 50) {
      return c.json({ error: 'Nama tenant maksimal 50 karakter' }, 400);
    }

    // Get current tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, lastNameChangeAt: true }
    });

    if (!tenant) {
      return c.json({ error: 'Tenant tidak ditemukan' }, 404);
    }

    // Check 30-day restriction
    if (tenant.lastNameChangeAt) {
      const daysSinceLastChange = Math.floor(
        (Date.now() - tenant.lastNameChangeAt.getTime()) / 86400000
      );
      
      if (daysSinceLastChange < 30) {
        const daysRemaining = 30 - daysSinceLastChange;
        return c.json({ 
          error: `Nama tenant hanya dapat diubah setiap 30 hari. Tunggu ${daysRemaining} hari lagi.`,
          daysRemaining
        }, 403);
      }
    }

    // Update tenant name
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { 
        name: name.trim(),
        lastNameChangeAt: new Date()
      },
      select: { id: true, name: true, lastNameChangeAt: true }
    });

    // Auto-update PrinterSettings storeName for all branches
    await prisma.printerSettings.updateMany({
      where: {
        cabang: {
          tenantId
        }
      },
      data: {
        storeName: name.trim()
      }
    });

    return c.json({
      message: 'Nama tenant berhasil diubah',
      tenant: updatedTenant
    });
  } catch (error) {
    logError(error, { context: 'Update tenant name' });
    return c.json({ error: 'Terjadi kesalahan server' }, 500);
  }
});

export default settings;
