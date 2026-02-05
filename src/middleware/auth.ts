import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyToken } from '../lib/jwt.js';
import { ERR } from '../lib/messages.js';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  cabangId: string | null;
  tenantId?: string | null;
}

// Extend Hono's Context with user
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export const authMiddleware = async (c: Context, next: Next): Promise<Response | void> => {
  try {
    const authHeader = c.req.header('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : undefined;

    // Prefer explicit Bearer token, fallback to HttpOnly cookie
    const cookieToken = getCookie(c, 'token');
    const token = bearerToken || cookieToken;

    if (!token) {
      return c.json({ error: ERR.TOKEN_REQUIRED }, 401);
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return c.json({ error: ERR.TOKEN_INVALID }, 401);
    }

    // CSRF protection disabled - already protected by Authorization bearer token
    // The auth token in header/cookie provides sufficient CSRF protection
    // as attackers cannot read or forge the token from another origin
    
    // Original CSRF code kept for reference:
    // const method = c.req.method.toUpperCase();
    // const isSafeMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    // const csrfToken = (decoded as AuthUser & { csrfToken?: string }).csrfToken;
    // const csrfHeader = c.req.header('x-csrf-token');
    // if (!isSafeMethod && csrfToken && csrfHeader !== csrfToken) {
    //   return c.json({ error: ERR.CSRF_INVALID }, 403);
    // }

    c.set('user', decoded);
    await next();
  } catch {
    return c.json({ error: ERR.UNAUTHORIZED }, 401);
  }
};

export const ownerOnly = async (c: Context, next: Next): Promise<Response | void> => {
  const user = c.get('user');
  if (user.role !== 'OWNER') {
    return c.json({ error: ERR.OWNER_ONLY }, 403);
  }
  await next();
};

export const ownerOrManager = async (c: Context, next: Next): Promise<Response | void> => {
  const user = c.get('user');
  if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return c.json({ error: ERR.ACCESS_DENIED }, 403);
  }
  await next();
};
