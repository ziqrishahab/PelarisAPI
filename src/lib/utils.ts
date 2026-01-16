/**
 * Utility Functions
 * Common helper functions used across the application
 */

import type { Context } from 'hono';

/**
 * Extract client IP address from request headers
 * Supports various proxy headers (x-forwarded-for, x-real-ip, cf-connecting-ip)
 */
export function getClientIP(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  const realIp = c.req.header('x-real-ip');
  const cfIp = c.req.header('cf-connecting-ip'); // Cloudflare
  
  return forwarded?.split(',')[0]?.trim() || realIp || cfIp || 'unknown';
}

/**
 * Format error message for user-friendly response
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

/**
 * Check if error is a Prisma known error
 */
export function isPrismaError(error: unknown): error is { code: string; meta?: any } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as any).code === 'string'
  );
}

/**
 * Get user-friendly error message from Prisma error
 */
export function getPrismaErrorMessage(error: { code: string; meta?: any }): string {
  switch (error.code) {
    case 'P2002':
      return 'Duplicate entry detected. This record already exists.';
    case 'P2025':
      return 'Record not found.';
    case 'P2003':
      return 'Cannot delete this record. It is still referenced by other records.';
    case 'P2014':
      return 'Invalid relation. The required relation is missing.';
    default:
      return 'Database error occurred.';
  }
}

/**
 * Sanitize string input (basic XSS prevention)
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate random string
 */
export function generateRandomString(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Format currency (IDR)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date (Indonesian locale)
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

/**
 * Format datetime (Indonesian locale)
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Sleep/delay function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await sleep(delay * Math.pow(2, i)); // Exponential backoff
      }
    }
  }
  
  throw lastError;
}
