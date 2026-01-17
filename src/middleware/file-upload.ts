import { MiddlewareHandler } from 'hono';
import logger from '../lib/logger.js';

/**
 * File upload validation configuration
 */
interface FileValidationOptions {
  maxSize?: number; // Maximum file size in bytes
  allowedMimeTypes?: string[]; // Allowed MIME types
  allowedExtensions?: string[]; // Allowed file extensions
}

/**
 * Default file validation options
 */
const DEFAULT_OPTIONS: FileValidationOptions = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.csv', '.xls', '.xlsx'],
};

/**
 * Validate file upload
 * Checks file size, MIME type, and extension
 */
export function validateFileUpload(options: FileValidationOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (file: File): Promise<{ valid: boolean; error?: string }> => {
    // Check file size
    if (opts.maxSize && file.size > opts.maxSize) {
      const maxSizeMB = (opts.maxSize / 1024 / 1024).toFixed(2);
      return {
        valid: false,
        error: `Ukuran file terlalu besar. Maksimal ${maxSizeMB}MB`,
      };
    }

    // Check MIME type
    if (opts.allowedMimeTypes && !opts.allowedMimeTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Tipe file tidak diizinkan. Hanya ${opts.allowedMimeTypes.join(', ')}`,
      };
    }

    // Check file extension
    if (opts.allowedExtensions) {
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!opts.allowedExtensions.includes(ext)) {
        return {
          valid: false,
          error: `Ekstensi file tidak diizinkan. Hanya ${opts.allowedExtensions.join(', ')}`,
        };
      }
    }

    // Basic malware check - check for executable extensions
    const dangerousExtensions = [
      '.exe',
      '.bat',
      '.cmd',
      '.com',
      '.scr',
      '.vbs',
      '.js',
      '.jar',
      '.app',
      '.deb',
      '.rpm',
    ];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (dangerousExtensions.includes(ext)) {
      logger.warn('Attempted upload of dangerous file', {
        filename: file.name,
        extension: ext,
        mimeType: file.type,
      });
      return {
        valid: false,
        error: 'File berbahaya terdeteksi',
      };
    }

    return { valid: true };
  };
}

/**
 * File upload validation middleware
 * For use with multipart/form-data requests
 */
export const fileUploadValidator = (options: FileValidationOptions = {}): MiddlewareHandler => {
  const validator = validateFileUpload(options);

  return async (c, next) => {
    const contentType = c.req.header('content-type');

    // Only validate multipart/form-data requests
    if (!contentType || !contentType.includes('multipart/form-data')) {
      await next();
      return;
    }

    try {
      const formData = await c.req.formData();
      const files: File[] = [];

      // Collect all files from form data
      for (const [, value] of formData.entries()) {
        if (value instanceof File) {
          files.push(value);
        }
      }

      // Validate each file
      for (const file of files) {
        const result = await validator(file);
        if (!result.valid) {
          return c.json({ error: result.error }, 400);
        }
      }

      // Store validated files in context for use in handlers
      c.set('validatedFiles', files);

      return await next();
    } catch (error) {
      logger.error('File upload validation error', { error });
      return c.json({ error: 'Gagal memvalidasi file upload' }, 400);
    }
  };
};

/**
 * Image upload validation (stricter)
 */
export const imageUploadValidator = (): MiddlewareHandler => {
  return fileUploadValidator({
    maxSize: 5 * 1024 * 1024, // 5MB for images
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  });
};

/**
 * Document upload validation
 */
export const documentUploadValidator = (): MiddlewareHandler => {
  return fileUploadValidator({
    maxSize: 20 * 1024 * 1024, // 20MB for documents
    allowedMimeTypes: [
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    allowedExtensions: ['.pdf', '.csv', '.xls', '.xlsx', '.doc', '.docx'],
  });
};
