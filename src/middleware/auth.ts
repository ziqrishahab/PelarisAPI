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

    // CSRF PROTECTION STATUS: DISABLED (Intentional)
    // 
    // Why CSRF is not needed for this API:
    // 1. Primary auth uses Bearer token in Authorization header
    //    - Attackers cannot read or inject headers from cross-origin requests
    //    - This is the OWASP recommended approach for APIs
    // 2. HttpOnly cookies use SameSite=Lax attribute
    //    - Prevents cookies from being sent in cross-origin POST requests
    // 3. CORS policy restricts which origins can make requests
    //    - Only whitelisted origins in config.cors.allowedOrigins
    //
    // Reference: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
    // Section: "Token Based (Stateless) Technique"

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
