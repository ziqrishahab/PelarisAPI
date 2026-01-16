import { Hono } from 'hono';
import prisma from '../lib/prisma.js';
import { authMiddleware, type AuthUser } from '../middleware/auth.js';
import { logError } from '../lib/logger.js';
import { validate, updateTenantSchema } from '../lib/validators.js';
import { ERR, MSG } from '../lib/messages.js';

type Variables = {
  user: AuthUser;
};

const tenants = new Hono<{ Variables: Variables }>();

// GET /api/tenants/current - Get current tenant info based on user
tenants.get('/current', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    if (!user.tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }
    
    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!tenant) {
      return c.json({ error: ERR.NOT_FOUND }, 404);
    }

    return c.json(tenant);
  } catch (error) {
    logError(error, { context: 'Get current tenant' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// GET /api/tenants/:id - Get tenant by ID (owner only)
tenants.get('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    if (user.role !== 'OWNER') {
      return c.json({ error: ERR.FORBIDDEN }, 403);
    }

    const id = c.req.param('id');
    
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            cabangs: true,
          }
        }
      }
    });

    if (!tenant) {
      return c.json({ error: ERR.NOT_FOUND }, 404);
    }

    return c.json(tenant);
  } catch (error) {
    logError(error, { context: 'Get tenant by ID' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

// PATCH /api/tenants/current - Update current tenant (owner only)
tenants.patch('/current', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    if (user.role !== 'OWNER') {
      return c.json({ error: ERR.FORBIDDEN }, 403);
    }

    if (!user.tenantId) {
      return c.json({ error: ERR.TENANT_REQUIRED }, 400);
    }

    const body = await c.req.json();
    
    // Zod validation
    const validation = validate(updateTenantSchema, body);
    if (!validation.success) {
      return c.json({ error: validation.error }, 400);
    }
    
    const { name, slug } = validation.data as { name?: string; slug?: string };

    const updatedTenant = await prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
      }
    });

    return c.json({ message: MSG.UPDATED, data: updatedTenant });
  } catch (error) {
    logError(error, { context: 'Update tenant' });
    return c.json({ error: ERR.SERVER_ERROR }, 500);
  }
});

export default tenants;
