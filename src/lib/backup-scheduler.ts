import cron from 'node-cron';
import prisma from './prisma.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, '../../backups');

// Ensure backup directory exists
async function ensureBackupDir(): Promise<void> {
  try {
    await fs.access(BACKUP_DIR);
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  }
}

// Check if auto backup is enabled for any tenant
async function getTenantsWithAutoBackup(): Promise<string[]> {
  try {
    const settings = await prisma.settings.findMany({
      where: { key: 'auto_backup_enabled' }
    });
    
    const enabledTenants: string[] = [];
    for (const setting of settings) {
      try {
        const enabled = JSON.parse(setting.value);
        if (enabled && setting.tenantId) {
          enabledTenants.push(setting.tenantId);
        }
      } catch {
        // Skip invalid JSON
      }
    }
    
    return enabledTenants;
  } catch (error) {
    logger.error('Failed to check auto backup status:', error);
    return [];
  }
}

// Perform backup for a specific tenant
async function performBackupForTenant(tenantId: string): Promise<void> {
  try {
    await ensureBackupDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `auto-backup-${tenantId}-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    
    logger.info(`[Auto Backup] Starting backup for tenant ${tenantId}...`);
    
    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        type: 'auto',
        tenantId
      },
      data: {
        users: await prisma.user.findMany({ where: { tenantId } }),
        categories: await prisma.category.findMany({ where: { tenantId } }),
        products: await prisma.product.findMany({ where: { tenantId } }),
        productVariants: await prisma.productVariant.findMany({
          where: { product: { tenantId } }
        }),
        variantTypes: await prisma.variantType.findMany({
          where: { product: { tenantId } }
        }),
        variantOptions: await prisma.variantOption.findMany({
          where: { variantType: { product: { tenantId } } }
        }),
        cabangs: await prisma.cabang.findMany({ where: { tenantId } }),
        stocks: await prisma.stock.findMany({
          where: { cabang: { tenantId } }
        }),
        stockAdjustments: await prisma.stockAdjustment.findMany({
          where: { cabang: { tenantId } }
        }),
        transactions: await prisma.transaction.findMany({
          where: { cabang: { tenantId } }
        }),
        transactionItems: await prisma.transactionItem.findMany({
          where: { transaction: { cabang: { tenantId } } }
        }),
        priceDiscrepancies: await prisma.priceDiscrepancy.findMany({
          where: { transaction: { cabang: { tenantId } } }
        }),
        stockTransfers: await prisma.stockTransfer.findMany({
          where: {
            OR: [
              { fromCabang: { tenantId } },
              { toCabang: { tenantId } }
            ]
          }
        }),
        returns: await prisma.return.findMany({
          where: { cabang: { tenantId } }
        }),
        returnItems: await prisma.returnItem.findMany({
          where: { return: { cabang: { tenantId } } }
        }),
        orders: await prisma.order.findMany({
          where: { cabang: { tenantId } }
        }),
        settings: await prisma.settings.findMany({ where: { tenantId } }),
        printerSettings: await prisma.printerSettings.findMany({
          where: { cabang: { tenantId } }
        })
      }
    };
    
    await fs.writeFile(filepath, JSON.stringify(backupData, null, 2), 'utf8');
    
    const stats = await fs.stat(filepath);
    
    // Update last backup record for this tenant
    await prisma.settings.upsert({
      where: { tenantId_key: { tenantId, key: 'last_backup' } },
      update: { 
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          filename,
          size: stats.size,
          type: 'auto'
        })
      },
      create: { 
        tenantId,
        key: 'last_backup',
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          filename,
          size: stats.size,
          type: 'auto'
        })
      }
    });
    
    logger.info(`[Auto Backup] Completed for tenant ${tenantId}: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
  } catch (error) {
    logger.error(`[Auto Backup] Failed for tenant ${tenantId}:`, error);
  }
}

// Perform backups for all enabled tenants
async function performBackup(): Promise<void> {
  const enabledTenants = await getTenantsWithAutoBackup();
  
  if (enabledTenants.length === 0) {
    logger.debug('[Auto Backup] No tenants with auto backup enabled');
    return;
  }
  
  logger.info(`[Auto Backup] Starting backups for ${enabledTenants.length} tenant(s)...`);
  
  // Backup each tenant
  for (const tenantId of enabledTenants) {
    await performBackupForTenant(tenantId);
  }
  
  // Cleanup old backups (keep last 7 days)
  await cleanupOldBackups();
}

// Clean up backups older than retention period
async function cleanupOldBackups(): Promise<void> {
  try {
    // Lazy import to avoid circular dependency
    const config = await import('../config/index.js');
    const retentionDays = config.default.backup.retentionDays;
    const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    const files = await fs.readdir(BACKUP_DIR);
    
    for (const file of files) {
      // Match both old format (auto-backup-*) and new format (auto-backup-{tenantId}-*)
      if (file.startsWith('auto-backup-') && file.endsWith('.json')) {
        const filepath = path.join(BACKUP_DIR, file);
        const stats = await fs.stat(filepath);
        
        if (stats.mtime.getTime() < cutoffDate) {
          await fs.unlink(filepath);
          logger.info(`[Auto Backup] Deleted old backup: ${file}`);
        }
      }
    }
  } catch (error) {
    logger.error('[Auto Backup] Cleanup failed:', error);
  }
}

// Scheduled task reference
let scheduledTask: cron.ScheduledTask | null = null;

// Start the backup scheduler
export function startBackupScheduler(): void {
  // Run daily at midnight (00:00)
  scheduledTask = cron.schedule('0 0 * * *', async () => {
    await performBackup();
  }, {
    timezone: 'Asia/Jakarta'
  });
  
  logger.info('[Backup Scheduler] Started - daily backup at 00:00 WIB');
}

// Stop the backup scheduler
export function stopBackupScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('[Backup Scheduler] Stopped');
  }
}

// Manual trigger for testing
export async function triggerBackupNow(): Promise<void> {
  await performBackup();
}

export default { startBackupScheduler, stopBackupScheduler, triggerBackupNow };
