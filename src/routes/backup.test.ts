import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, '../../backups');

describe('Backup Routes', () => {
  describe('GET /api/backup/auto-status', () => {
    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/backup/auto-status');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/backup/last-backup', () => {
    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/backup/last-backup');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/backup/database', () => {
    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/backup/database', {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/backup/auto-backup', () => {
    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/backup/auto-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/backup/list', () => {
    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/backup/list');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/backup/restore', () => {
    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'test.json' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/backup/export/transactions', () => {
    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/backup/export/transactions');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/backup/export/products', () => {
    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/backup/export/products');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/backup/export/report', () => {
    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/backup/export/report');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/backup/reset-settings', () => {
    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/backup/reset-settings', {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });
  });
});
