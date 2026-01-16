import jwt, { SignOptions } from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  cabangId: string | null;
  tenantId?: string | null;
  // Optional CSRF token for cookie-based auth
  csrfToken?: string;
}

// Validate JWT_SECRET on module load
import config from '../config/index.js';

const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;

export const generateToken = (
  userId: string,
  email: string,
  role: string,
  cabangId: string | null = null,
  tenantId?: string | null,
  csrfToken?: string
): string => {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
  };
  return jwt.sign(
    { userId, email, role, cabangId, tenantId, csrfToken },
    JWT_SECRET,
    options
  );
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
};
