import prisma from './prisma.js';
import type { AuthUser } from '../middleware/auth.js';

interface AuditContext {
  user?: AuthUser | null;
  ip?: string | null;
}

export async function createAuditLog(params: {
  action: string;
  entityType: string;
  entityId: string;
  description?: string;
  metadata?: Record<string, unknown>;
  context?: AuditContext;
}) {
  const { action, entityType, entityId, description, metadata, context } = params;
  const user = context?.user;

  try {
    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        description,
        metadata: metadata ? (metadata as any) : undefined,
        tenantId: user?.tenantId || null,
        cabangId: user?.cabangId || null,
        userId: user?.userId || null,
        ip: context?.ip || undefined,
      },
    });
  } catch {
    // Audit failures must not break main flow
  }
}

