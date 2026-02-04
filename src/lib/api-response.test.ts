import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  success,
  created,
  paginated,
  error,
  notFound,
  unauthorized,
  forbidden,
  validationError,
  serverError,
  parsePagination,
  createPaginationMeta,
  type ApiSuccessResponse,
  type ApiErrorResponse,
} from './api-response';

// Helper to parse JSON response
const json = async (res: Response) => res.json();

describe('API Response Helpers', () => {
  describe('success', () => {
    it('should return success response with data', async () => {
      const app = new Hono();
      app.get('/test', (c) => success(c, { id: '1', name: 'Test' }));

      const res = await app.request('/test');
      const data = (await json(res)) as ApiSuccessResponse<{ id: string; name: string }>;

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual({ id: '1', name: 'Test' });
    });

    it('should return success response with message', async () => {
      const app = new Hono();
      app.get('/test', (c) =>
        success(c, { id: '1' }, { message: 'Operation successful' })
      );

      const res = await app.request('/test');
      const data = (await json(res)) as ApiSuccessResponse<{ id: string }>;

      expect(data.success).toBe(true);
      expect(data.message).toBe('Operation successful');
    });

    it('should return success response with custom status', async () => {
      const app = new Hono();
      app.get('/test', (c) =>
        success(c, { id: '1' }, { status: 202 })
      );

      const res = await app.request('/test');
      expect(res.status).toBe(202);
    });
  });

  describe('created', () => {
    it('should return 201 status with data', async () => {
      const app = new Hono();
      app.post('/test', (c) =>
        created(c, { id: 'new-1', name: 'New Item' }, 'Item created')
      );

      const res = await app.request('/test', { method: 'POST' });
      const data = (await json(res)) as ApiSuccessResponse<{ id: string; name: string }>;

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Item created');
    });
  });

  describe('paginated', () => {
    it('should return paginated response with meta', async () => {
      const app = new Hono();
      app.get('/test', (c) =>
        paginated(
          c,
          [{ id: '1' }, { id: '2' }],
          { total: 50, page: 2, limit: 10 }
        )
      );

      const res = await app.request('/test');
      const data = (await json(res)) as ApiSuccessResponse<{ id: string }[]>;

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.meta).toBeDefined();
      expect(data.meta?.total).toBe(50);
      expect(data.meta?.page).toBe(2);
      expect(data.meta?.limit).toBe(10);
      expect(data.meta?.totalPages).toBe(5);
      expect(data.meta?.hasNext).toBe(true);
      expect(data.meta?.hasPrev).toBe(true);
    });

    it('should calculate hasNext and hasPrev correctly', async () => {
      const app = new Hono();
      app.get('/test', (c) =>
        paginated(c, [{ id: '1' }], { total: 30, page: 1, limit: 10 })
      );

      const res = await app.request('/test');
      const data = (await json(res)) as ApiSuccessResponse<{ id: string }[]>;

      expect(data.meta?.hasNext).toBe(true);
      expect(data.meta?.hasPrev).toBe(false);
    });
  });

  describe('error', () => {
    it('should return error response', async () => {
      const app = new Hono();
      app.get('/test', (c) => error(c, 'Something went wrong', 400));

      const res = await app.request('/test');
      const data = (await json(res)) as ApiErrorResponse;

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Something went wrong');
    });

    it('should return error response with code and details', async () => {
      const app = new Hono();
      app.get('/test', (c) =>
        error(c, 'Validation failed', 400, {
          code: 'VALIDATION_ERROR',
          details: { email: ['Invalid format'] },
        })
      );

      const res = await app.request('/test');
      const data = (await json(res)) as ApiErrorResponse;

      expect(data.code).toBe('VALIDATION_ERROR');
      expect(data.details).toEqual({ email: ['Invalid format'] });
    });
  });

  describe('notFound', () => {
    it('should return 404 with entity name', async () => {
      const app = new Hono();
      app.get('/test', (c) => notFound(c, 'User'));

      const res = await app.request('/test');
      const data = (await json(res)) as ApiErrorResponse;

      expect(res.status).toBe(404);
      expect(data.error).toBe('User tidak ditemukan');
      expect(data.code).toBe('NOT_FOUND');
    });
  });

  describe('unauthorized', () => {
    it('should return 401 with default message', async () => {
      const app = new Hono();
      app.get('/test', (c) => unauthorized(c));

      const res = await app.request('/test');
      const data = (await json(res)) as ApiErrorResponse;

      expect(res.status).toBe(401);
      expect(data.error).toBe('Tidak memiliki akses');
    });
  });

  describe('forbidden', () => {
    it('should return 403', async () => {
      const app = new Hono();
      app.get('/test', (c) => forbidden(c, 'Owner only'));

      const res = await app.request('/test');
      const data = (await json(res)) as ApiErrorResponse;

      expect(res.status).toBe(403);
      expect(data.error).toBe('Owner only');
    });
  });

  describe('validationError', () => {
    it('should return 400 with validation details', async () => {
      const app = new Hono();
      app.get('/test', (c) =>
        validationError(c, 'Data tidak valid', { name: ['Required'] })
      );

      const res = await app.request('/test');
      const data = (await json(res)) as ApiErrorResponse;

      expect(res.status).toBe(400);
      expect(data.code).toBe('VALIDATION_ERROR');
      expect(data.details).toEqual({ name: ['Required'] });
    });
  });

  describe('serverError', () => {
    it('should return 500 with default message', async () => {
      const app = new Hono();
      app.get('/test', (c) => serverError(c));

      const res = await app.request('/test');
      const data = (await json(res)) as ApiErrorResponse;

      expect(res.status).toBe(500);
      expect(data.error).toBe('Terjadi kesalahan server');
      expect(data.code).toBe('SERVER_ERROR');
    });
  });

  describe('parsePagination', () => {
    it('should parse pagination from query params', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        const pagination = parsePagination(c);
        return c.json(pagination);
      });

      const res = await app.request('/test?page=3&limit=25');
      const data = (await json(res)) as { page: number; limit: number; skip: number };

      expect(data.page).toBe(3);
      expect(data.limit).toBe(25);
      expect(data.skip).toBe(50);
    });

    it('should use defaults when not provided', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        const pagination = parsePagination(c, { page: 1, limit: 10 });
        return c.json(pagination);
      });

      const res = await app.request('/test');
      const data = (await json(res)) as { page: number; limit: number; skip: number };

      expect(data.page).toBe(1);
      expect(data.limit).toBe(10);
      expect(data.skip).toBe(0);
    });

    it('should cap limit at 100', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        const pagination = parsePagination(c);
        return c.json(pagination);
      });

      const res = await app.request('/test?limit=500');
      const data = (await json(res)) as { limit: number };

      expect(data.limit).toBe(100);
    });

    it('should ensure minimum page and limit of 1', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        const pagination = parsePagination(c);
        return c.json(pagination);
      });

      const res = await app.request('/test?page=-1&limit=0');
      const data = (await json(res)) as { page: number; limit: number };

      expect(data.page).toBe(1);
      expect(data.limit).toBe(1);
    });
  });

  describe('createPaginationMeta', () => {
    it('should create correct pagination meta', () => {
      const meta = createPaginationMeta(100, 3, 20);

      expect(meta.total).toBe(100);
      expect(meta.page).toBe(3);
      expect(meta.limit).toBe(20);
      expect(meta.totalPages).toBe(5);
      expect(meta.hasNext).toBe(true);
      expect(meta.hasPrev).toBe(true);
    });

    it('should handle last page correctly', () => {
      const meta = createPaginationMeta(50, 5, 10);

      expect(meta.totalPages).toBe(5);
      expect(meta.hasNext).toBe(false);
      expect(meta.hasPrev).toBe(true);
    });

    it('should handle single page correctly', () => {
      const meta = createPaginationMeta(5, 1, 10);

      expect(meta.totalPages).toBe(1);
      expect(meta.hasNext).toBe(false);
      expect(meta.hasPrev).toBe(false);
    });
  });
});
