import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";

export async function logAudit(params: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: Prisma.InputJsonValue;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        detail: params.detail,
        ip: params.ip ?? null,
      },
    });
  } catch (err) {
    // Audit logging must never break the main operation.
    console.error("[audit] failed to write log:", err);
  }
}
