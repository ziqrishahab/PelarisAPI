import { MiddlewareHandler } from 'hono';
import prisma from '../lib/prisma.js';
import { AuthUser } from './auth.js';

/**
 * Soft delete middleware
 * Automatically excludes soft-deleted records from queries
 * Works with models that have isActive field
 */
export const excludeInactive = (): MiddlewareHandler => {
  return async (c, next) => {
    // This middleware modifies Prisma queries to automatically exclude inactive records
    // For now, we handle this at the route level, but this can be extended

    await next();
  };
};

/**
 * Soft delete helper function
 * Marks a record as inactive instead of deleting it
 */
export async function softDelete<T extends { isActive: boolean }>(
  model: any,
  id: string,
  user?: AuthUser
): Promise<T> {
  return await model.update({
    where: { id },
    data: {
      isActive: false,
      // If you add deletedAt and deletedBy fields, uncomment:
      // deletedAt: new Date(),
      // deletedBy: user?.userId
    },
  });
}

/**
 * Restore soft-deleted record
 */
export async function restoreSoftDeleted<T extends { isActive: boolean }>(
  model: any,
  id: string
): Promise<T> {
  return await model.update({
    where: { id },
    data: {
      isActive: true,
      // If you add deletedAt and deletedBy fields, uncomment:
      // deletedAt: null,
      // deletedBy: null
    },
  });
}

/**
 * Hard delete (permanent deletion)
 * Should only be used for admin operations or data cleanup
 */
export async function hardDelete(model: any, id: string): Promise<void> {
  await model.delete({
    where: { id },
  });
}

/**
 * Check if record is soft-deleted
 */
export async function isSoftDeleted(model: any, id: string): Promise<boolean> {
  const record = await model.findUnique({
    where: { id },
    select: { isActive: true },
  });
  return record ? !record.isActive : true;
}
