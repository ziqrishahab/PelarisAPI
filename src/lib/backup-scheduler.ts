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

// Check if auto backup is enabled
async function isAutoBackupEnabled(): Promise<boolean> {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'auto_backup_enabled' }
    });
    return setting ? JSON.parse(setting.value) : false;
  } catch (error) {
    logger.error('Failed to check auto backup status:', error);
    return false;
  }
}

// Perform the actual backup
async function performBackup(): Promise<void> {
  try {
    await ensureBackupDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `auto-backup-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    
    logger.info('[Auto Backup] Starting scheduled backup...');
    
    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        type: 'auto'
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
    
    await fs.writeFile(filepath, JSON.stringify(backupData, null, 2), 'utf8');
    
    const stats = await fs.stat(filepath);
    
    // Update last backup record
    await prisma.settings.upsert({
      where: { key: 'last_backup' },
      update: { 
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          filename,
          size: stats.size,
          type: 'auto'
        })
      },
      create: { 
        key: 'last_backup',
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          filename,
          size: stats.size,
          type: 'auto'
        })
      }
    });
    
    logger.info(`[Auto Backup] Completed: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Cleanup old backups (keep last 7 days)
    await cleanupOldBackups();
    
  } catch (error) {
    logger.error('[Auto Backup] Failed:', error);
  }
}

// Clean up backups older than retention period
async function cleanupOldBackups(): Promise<void> {
  try {
    const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '7');
    const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    const files = await fs.readdir(BACKUP_DIR);
    
    for (const file of files) {
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
    const enabled = await isAutoBackupEnabled();
    if (enabled) {
      await performBackup();
    } else {
      logger.debug('[Auto Backup] Skipped - auto backup is disabled');
    }
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
