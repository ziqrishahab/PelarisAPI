import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, ownerOnly, type AuthUser } from '../middleware/auth.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import logger, { logError } from '../lib/logger.js';

type Variables = {
  user: AuthUser;
};

// Create backups directory if not exists
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, '../../backups');

const ensureBackupDir = async () => {
  try {
    await fs.access(BACKUP_DIR);
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  }
};

const backup = new Hono<{ Variables: Variables }>();

// Manual Database Backup (JSON format - cross-platform compatible)
backup.post('/database', authMiddleware, ownerOnly, async (c) => {
  try {
    await ensureBackupDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    
    // Export all data from all tables using Prisma
    logger.info('[Backup] Starting database backup...');
    
    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0'
      },
      data: {
        users: await prisma.user.findMany(),
        categories: await prisma.category.findMany(),
        products: await prisma.product.findMany(),
        productVariants: await prisma.productVariant.findMany(),
        variantTypes: await prisma.variantType.findMany(),
        variantOptions: await prisma.variantOption.findMany(),
        cabangs: await prisma.cabang.findMany(),
        stocks: await prisma.stock.findMany(),
        stockAdjustments: await prisma.stockAdjustment.findMany(),
        transactions: await prisma.transaction.findMany(),
        transactionItems: await prisma.transactionItem.findMany(),
        priceDiscrepancies: await prisma.priceDiscrepancy.findMany(),
        stockTransfers: await prisma.stockTransfer.findMany(),
        returns: await prisma.return.findMany(),
        returnItems: await prisma.returnItem.findMany(),
        orders: await prisma.order.findMany(),
        settings: await prisma.settings.findMany(),
        printerSettings: await prisma.printerSettings.findMany()
      }
    };
    
    // Write to file
    await fs.writeFile(filepath, JSON.stringify(backupData, null, 2), 'utf8');
    
    // Get file stats
    const stats = await fs.stat(filepath);
    
    // Save backup record to database
    await prisma.settings.upsert({
      where: { key: 'last_backup' },
      update: { 
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          filename,
          size: stats.size,
          type: 'manual'
        })
      },
      create: { 
        key: 'last_backup',
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          filename,
          size: stats.size,
          type: 'manual'
        })
      }
    });
    
    logger.info(`[Backup] Completed: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    return c.json({ 
      success: true, 
      filename,
      size: stats.size,
      timestamp: new Date()
    });
  } catch (error: any) {
    logError(error, { context: 'Backup' });
    return c.json({ error: error.message }, 500);
  }
});

// Get Auto Backup Status
backup.get('/auto-status', authMiddleware, ownerOnly, async (c) => {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'auto_backup_enabled' }
    });
    
    const enabled = setting ? JSON.parse(setting.value) : false;
    return c.json({ enabled });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Toggle Auto Backup
backup.post('/auto-backup', authMiddleware, ownerOnly, async (c) => {
  try {
    const body = await c.req.json();
    const { enabled } = body as { enabled: boolean };
    
    await prisma.settings.upsert({
      where: { key: 'auto_backup_enabled' },
      update: { value: JSON.stringify(enabled) },
      create: { key: 'auto_backup_enabled', value: JSON.stringify(enabled) }
    });
    
    return c.json({ success: true, enabled });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get Last Backup Info
backup.get('/last-backup', authMiddleware, ownerOnly, async (c) => {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'last_backup' }
    });
    
    if (!setting) {
      return c.json({ lastBackup: null });
    }
    
    const data = JSON.parse(setting.value);
    return c.json({ lastBackup: data });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Export Transactions to CSV
backup.get('/export/transactions', authMiddleware, ownerOnly, async (c) => {
  try {
    const transactions = await prisma.transaction.findMany({
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: true
              }
            }
          }
        },
        kasir: {
          select: {
            name: true
          }
        },
        cabang: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Convert to CSV
    const csvRows: string[] = [];
    
    // Header
    csvRows.push([
      'Transaction ID',
      'Date',
      'Cashier',
      'Branch',
      'Product',
      'Variant',
      'Quantity',
      'Price',
      'Subtotal',
      'Payment Method',
      'Total Amount',
      'Cash',
      'Change'
    ].join(','));
    
    // Data rows
    transactions.forEach(transaction => {
      transaction.items.forEach(item => {
        csvRows.push([
          transaction.id,
          new Date(transaction.createdAt).toLocaleString('id-ID'),
          transaction.kasir?.name || '-',
          transaction.cabang.name,
          item.productVariant.product.name,
          item.productVariant.variantValue || '-',
          item.quantity,
          item.price,
          item.quantity * Number(item.price),
          transaction.paymentMethod || '-',
          transaction.total,
          (transaction as any).cashAmount || 0,
          (transaction as any).changeAmount || 0
        ].map(val => `"${val}"`).join(','));
      });
    });
    
    const csv = csvRows.join('\n');
    
    return new Response('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=transactions-${Date.now()}.csv`
      }
    });
  } catch (error: any) {
    logError(error, { context: 'Export transactions' });
    return c.json({ error: error.message }, 500);
  }
});

// Export Products to CSV
backup.get('/export/products', authMiddleware, ownerOnly, async (c) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        variants: {
          include: {
            stocks: {
              include: {
                cabang: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        },
        category: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    // Get all stock alerts
    const alerts = await prisma.stockAlert.findMany({
      select: {
        productVariantId: true,
        cabangId: true,
        minStock: true,
        isActive: true
      }
    });
    
    // Create alert lookup map for fast access
    const alertMap = new Map<string, { minStock: number; isActive: boolean }>();
    alerts.forEach(alert => {
      const key = `${alert.productVariantId}-${alert.cabangId}`;
      alertMap.set(key, { minStock: alert.minStock, isActive: alert.isActive });
    });
    
    // Convert to CSV
    const csvRows: string[] = [];
    
    // Header
    csvRows.push([
      'Product ID',
      'Product Name',
      'Category',
      'Type',
      'Variant',
      'SKU',
      'Price',
      'Branch',
      'Stock Quantity',
      'Min Alert',
      'Alert Active',
      'Created Date'
    ].join(','));
    
    // Data rows
    products.forEach(product => {
      product.variants.forEach(variant => {
        variant.stocks.forEach(stock => {
          const alertKey = `${variant.id}-${stock.cabang.id}`;
          const alert = alertMap.get(alertKey);
          
          csvRows.push([
            product.id,
            product.name,
            product.category?.name || '-',
            product.productType || '-',
            variant.variantValue || '-',
            variant.sku || '-',
            stock.price || 0,
            stock.cabang.name,
            stock.quantity,
            alert?.minStock || '',
            alert?.isActive ? 'Yes' : (alert ? 'No' : ''),
            new Date(product.createdAt).toLocaleDateString('id-ID')
          ].map(val => `"${val}"`).join(','));
        });
      });
    });
    
    const csv = csvRows.join('\n');
    
    return new Response('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=products-${Date.now()}.csv`
      }
    });
  } catch (error: any) {
    logError(error, { context: 'Export products' });
    return c.json({ error: error.message }, 500);
  }
});

// Export Report to PDF (simplified - returns JSON data for now)
backup.get('/export/report', authMiddleware, ownerOnly, async (c) => {
  try {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    
    // Get transactions in date range
    const whereClause: any = {};
    if (startDate && endDate) {
      whereClause.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }
    
    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: true
              }
            }
          }
        },
        cabang: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Calculate summary
    const summary: any = {
      totalTransactions: transactions.length,
      totalRevenue: transactions.reduce((sum, t) => sum + Number(t.total), 0),
      totalItems: transactions.reduce((sum, t) => sum + t.items.length, 0),
      byPaymentMethod: {} as Record<string, number>,
      byBranch: {} as Record<string, number>,
      topProducts: {} as Record<string, { quantity: number; revenue: number }>
    };
    
    // Aggregate by payment method
    transactions.forEach(t => {
      const pm = t.paymentMethod || 'UNKNOWN';
      summary.byPaymentMethod[pm] = 
        (summary.byPaymentMethod[pm] || 0) + Number(t.total);
      
      summary.byBranch[t.cabang.name] = 
        (summary.byBranch[t.cabang.name] || 0) + Number(t.total);
      
      t.items.forEach(item => {
        const productName = item.productVariant.product.name;
        if (!summary.topProducts[productName]) {
          summary.topProducts[productName] = { quantity: 0, revenue: 0 };
        }
        summary.topProducts[productName].quantity += item.quantity;
        summary.topProducts[productName].revenue += item.quantity * Number(item.price);
      });
    });
    
    // For now, return JSON (can be converted to PDF on frontend using browser print or jsPDF)
    return c.json({
      summary,
      transactions: transactions.slice(0, 100), // Limit to 100 for performance
      generatedAt: new Date()
    });
  } catch (error: any) {
    logError(error, { context: 'Export report' });
    return c.json({ error: error.message }, 500);
  }
});

// Reset Settings to Default
backup.post('/reset-settings', authMiddleware, ownerOnly, async (c) => {
  try {
    // Delete all custom settings except critical ones
    await prisma.settings.deleteMany({
      where: {
        key: {
          notIn: ['last_backup', 'auto_backup_enabled']
        }
      }
    });
    
    return c.json({ success: true, message: 'Settings reset to default' });
  } catch (error: any) {
    logError(error, { context: 'Reset settings' });
    return c.json({ error: error.message }, 500);
  }
});

// List available backup files
backup.get('/list', authMiddleware, ownerOnly, async (c) => {
  try {
    await ensureBackupDir();
    
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = [];
    
    for (const file of files) {
      if (file.endsWith('.json') && (file.startsWith('backup-') || file.startsWith('auto-backup-'))) {
        const filepath = path.join(BACKUP_DIR, file);
        const stats = await fs.stat(filepath);
        
        backupFiles.push({
          filename: file,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
          type: file.startsWith('auto-backup-') ? 'auto' : 'manual'
        });
      }
    }
    
    // Sort by date descending
    backupFiles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return c.json({ backups: backupFiles });
  } catch (error: any) {
    logError(error, { context: 'List backups' });
    return c.json({ error: error.message }, 500);
  }
});

// Download a specific backup file
backup.get('/download/:filename', authMiddleware, ownerOnly, async (c) => {
  try {
    const filename = c.req.param('filename');
    
    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: 'Invalid filename' }, 400);
    }
    
    const filepath = path.join(BACKUP_DIR, filename);
    
    // Check if file exists
    try {
      await fs.access(filepath);
    } catch {
      return c.json({ error: 'Backup file not found' }, 404);
    }
    
    const content = await fs.readFile(filepath, 'utf8');
    
    return new Response(content, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error: any) {
    logError(error, { context: 'Download backup' });
    return c.json({ error: error.message }, 500);
  }
});

// Delete a backup file
backup.delete('/delete/:filename', authMiddleware, ownerOnly, async (c) => {
  try {
    const filename = c.req.param('filename');
    
    // Validate filename
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: 'Invalid filename' }, 400);
    }
    
    const filepath = path.join(BACKUP_DIR, filename);
    
    try {
      await fs.access(filepath);
    } catch {
      return c.json({ error: 'Backup file not found' }, 404);
    }
    
    await fs.unlink(filepath);
    logger.info(`[Backup] Deleted: ${filename}`);
    
    return c.json({ success: true, message: 'Backup deleted' });
  } catch (error: any) {
    logError(error, { context: 'Delete backup' });
    return c.json({ error: error.message }, 500);
  }
});

// Restore database from backup
backup.post('/restore', authMiddleware, ownerOnly, async (c) => {
  try {
    const body = await c.req.json();
    const { filename } = body as { filename: string };
    
    if (!filename) {
      return c.json({ error: 'Filename is required' }, 400);
    }
    
    // Validate filename
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: 'Invalid filename' }, 400);
    }
    
    const filepath = path.join(BACKUP_DIR, filename);
    
    // Check if file exists
    try {
      await fs.access(filepath);
    } catch {
      return c.json({ error: 'Backup file not found' }, 404);
    }
    
    logger.info(`[Restore] Starting restore from: ${filename}`);
    
    // Read and parse backup file
    const content = await fs.readFile(filepath, 'utf8');
    const backupData = JSON.parse(content);
    
    if (!backupData.data) {
      return c.json({ error: 'Invalid backup file format' }, 400);
    }
    
    // Restore in transaction with proper order (respect foreign keys)
    await prisma.$transaction(async (tx) => {
      // Clear existing data in reverse dependency order
      await tx.returnItem.deleteMany();
      await tx.return.deleteMany();
      await tx.transactionItem.deleteMany();
      await tx.transaction.deleteMany();
      await tx.priceDiscrepancy.deleteMany();
      await tx.stockTransfer.deleteMany();
      await tx.stockAdjustment.deleteMany();
      await tx.stock.deleteMany();
      await tx.stockAlert.deleteMany();
      await tx.order.deleteMany();
      await tx.variantOption.deleteMany();
      await tx.variantType.deleteMany();
      await tx.productVariant.deleteMany();
      await tx.product.deleteMany();
      await tx.category.deleteMany();
      await tx.printerSettings.deleteMany();
      await tx.settings.deleteMany();
      await tx.user.deleteMany();
      await tx.cabang.deleteMany();
      
      // Restore data in correct order (parents first)
      const data = backupData.data;
      
      if (data.cabangs?.length) {
        await tx.cabang.createMany({ data: data.cabangs, skipDuplicates: true });
      }
      if (data.users?.length) {
        await tx.user.createMany({ data: data.users, skipDuplicates: true });
      }
      if (data.categories?.length) {
        await tx.category.createMany({ data: data.categories, skipDuplicates: true });
      }
      if (data.products?.length) {
        await tx.product.createMany({ data: data.products, skipDuplicates: true });
      }
      if (data.productVariants?.length) {
        await tx.productVariant.createMany({ data: data.productVariants, skipDuplicates: true });
      }
      if (data.variantTypes?.length) {
        await tx.variantType.createMany({ data: data.variantTypes, skipDuplicates: true });
      }
      if (data.variantOptions?.length) {
        await tx.variantOption.createMany({ data: data.variantOptions, skipDuplicates: true });
      }
      if (data.stocks?.length) {
        await tx.stock.createMany({ data: data.stocks, skipDuplicates: true });
      }
      if (data.stockAdjustments?.length) {
        await tx.stockAdjustment.createMany({ data: data.stockAdjustments, skipDuplicates: true });
      }
      if (data.transactions?.length) {
        await tx.transaction.createMany({ data: data.transactions, skipDuplicates: true });
      }
      if (data.transactionItems?.length) {
        await tx.transactionItem.createMany({ data: data.transactionItems, skipDuplicates: true });
      }
      if (data.priceDiscrepancies?.length) {
        await tx.priceDiscrepancy.createMany({ data: data.priceDiscrepancies, skipDuplicates: true });
      }
      if (data.stockTransfers?.length) {
        await tx.stockTransfer.createMany({ data: data.stockTransfers, skipDuplicates: true });
      }
      if (data.returns?.length) {
        await tx.return.createMany({ data: data.returns, skipDuplicates: true });
      }
      if (data.returnItems?.length) {
        await tx.returnItem.createMany({ data: data.returnItems, skipDuplicates: true });
      }
      if (data.orders?.length) {
        await tx.order.createMany({ data: data.orders, skipDuplicates: true });
      }
      if (data.settings?.length) {
        await tx.settings.createMany({ data: data.settings, skipDuplicates: true });
      }
      if (data.printerSettings?.length) {
        await tx.printerSettings.createMany({ data: data.printerSettings, skipDuplicates: true });
      }
    });
    
    logger.info(`[Restore] Completed from: ${filename}`);
    
    return c.json({ 
      success: true, 
      message: 'Database restored successfully',
      restoredFrom: filename,
      timestamp: backupData.metadata?.timestamp
    });
  } catch (error: any) {
    logError(error, { context: 'Restore backup' });
    return c.json({ error: error.message }, 500);
  }
});

export default backup;
