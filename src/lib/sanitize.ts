/**
 * Input Sanitization Utilities
 * 
 * Provides functions to sanitize user input and prevent XSS attacks.
 * Used for data that will be stored in database or displayed in UI.
 */

/**
 * Strip HTML tags from string
 */
export function stripHtml(str: string): string {
  if (!str) return str;
  return String(str).replace(/<[^>]*>/g, '');
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  if (!str) return str;
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(str).replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

/**
 * Sanitize string for safe storage and display
 * - Strips HTML tags
 * - Trims whitespace
 * - Limits length
 * - Removes null bytes and control characters
 */
export function sanitizeString(str: string | number | null | undefined, maxLength = 1000): string {
  if (str === null || str === undefined || str === '') return '';
  
  // Convert to string first (handles numbers from Excel)
  let result = String(str)
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters (except newlines and tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Trim whitespace
    .trim();
  
  // Limit length
  if (result.length > maxLength) {
    result = result.substring(0, maxLength);
  }
  
  return result;
}

/**
 * Sanitize text that may contain multiple lines (descriptions, notes)
 * Preserves newlines but sanitizes content
 */
export function sanitizeText(str: string | number | null | undefined, maxLength = 5000): string {
  if (str === null || str === undefined || str === '') return '';
  
  // Convert to string first (handles numbers from Excel)
  let result = String(str)
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except newline, tab, carriage return
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Trim whitespace
    .trim();
  
  // Limit length
  if (result.length > maxLength) {
    result = result.substring(0, maxLength);
  }
  
  return result;
}

/**
 * Sanitize SKU/code (alphanumeric, dashes, underscores only)
 */
export function sanitizeSku(str: string | number | null | undefined, maxLength = 100): string {
  if (str === null || str === undefined || str === '') return '';
  
  // Convert to string first (handles numbers from Excel)
  return String(str)
    // Allow only alphanumeric, dash, underscore, dot
    .replace(/[^a-zA-Z0-9\-_\.]/g, '')
    // Trim
    .trim()
    // Limit length
    .substring(0, maxLength);
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(str: string | number | null | undefined): string {
  if (str === null || str === undefined || str === '') return '';
  
  // Convert to string first
  return String(str)
    // Remove directory traversal attempts
    .replace(/\.\./g, '')
    // Remove path separators
    .replace(/[\/\\]/g, '')
    // Allow only safe characters
    .replace(/[^a-zA-Z0-9\-_\.]/g, '_')
    // Trim
    .trim()
    // Limit length
    .substring(0, 255);
}

/**
 * Sanitize URL (basic validation)
 */
export function sanitizeUrl(str: string | number | null | undefined): string | null {
  if (str === null || str === undefined || str === '') return null;
  
  // Convert to string first
  const trimmed = String(str).trim();
  
  // Only allow http and https protocols
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }
  
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Sanitize number from string input
 */
export function sanitizeNumber(value: unknown, defaultValue = 0): number {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  
  if (isNaN(num) || !isFinite(num)) {
    return defaultValue;
  }
  
  return num;
}

/**
 * Sanitize integer from string input
 */
export function sanitizeInt(value: unknown, defaultValue = 0): number {
  const num = sanitizeNumber(value, defaultValue);
  return Math.floor(num);
}

/**
 * Sanitize positive integer (for quantities, etc.)
 */
export function sanitizePositiveInt(value: unknown, defaultValue = 0): number {
  const num = sanitizeInt(value, defaultValue);
  return Math.max(0, num);
}

/**
 * Batch sanitize object properties
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  rules: Partial<Record<keyof T, 'string' | 'text' | 'sku' | 'url' | 'number' | 'int' | 'positiveInt'>>
): T {
  const result = { ...obj };
  
  for (const [key, rule] of Object.entries(rules)) {
    const value = result[key as keyof T];
    
    switch (rule) {
      case 'string':
        (result as Record<string, unknown>)[key] = sanitizeString(value as string);
        break;
      case 'text':
        (result as Record<string, unknown>)[key] = sanitizeText(value as string);
        break;
      case 'sku':
        (result as Record<string, unknown>)[key] = sanitizeSku(value as string);
        break;
      case 'url':
        (result as Record<string, unknown>)[key] = sanitizeUrl(value as string);
        break;
      case 'number':
        (result as Record<string, unknown>)[key] = sanitizeNumber(value);
        break;
      case 'int':
        (result as Record<string, unknown>)[key] = sanitizeInt(value);
        break;
      case 'positiveInt':
        (result as Record<string, unknown>)[key] = sanitizePositiveInt(value);
        break;
    }
  }
  
  return result;
}
