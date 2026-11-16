"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createNotification } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { ApprovalStatus, ReportStatus } from "@/generated/prisma/enums";

function entityLink(entityType: string, entityId: string): string {
  return entityType === "report" ? `/reports/${entityId}` : "/approvals";
}

/** Submit an entity into an ordered approval chain (up to 3 approvers). */
export async function submitForApprovalAction(entityType: string, entityId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const approvers = [...new Set(
    [formData.get("approver1"), formData.get("approver2"), formData.get("approver3")].map((x) => String(x || "")).filter(Boolean),
  )];
  if (approvers.length === 0) return;

  await prisma.approvalFlow.deleteMany({ where: { entityType, entityId } });
  await prisma.approvalFlow.createMany({
    data: approvers.map((approverId, i) => ({
      entityType,
      entityId,
      approverId,
      requestedById: user.id,
      step: i + 1,
      status: ApprovalStatus.PENDING,
    })),
  });
  if (entityType === "report") {
    await prisma.selfAssessmentReport.update({ where: { id: entityId }, data: { status: ReportStatus.IN_REVIEW } }).catch(() => {});
  }
  await createNotification({
    userId: approvers[0],
    title: "Bạn có yêu cầu phê duyệt mới",
    message: "Cần phê duyệt (bước 1)",
    link: entityLink(entityType, entityId),
  });
  await logAudit({ userId: user.id, action: "SUBMIT_APPROVAL", entityType, entityId, detail: { steps: approvers.length } });
  revalidatePath(entityLink(entityType, entityId));
  revalidatePath("/approvals");
}

/** Approve or reject the current step; advances the chain or finalizes the entity. */
export async function decideApprovalAction(id: string, decision: "APPROVED" | "REJECTED", formData: FormData): Promise<void> {
  const user = await requireUser();
  const note = String(formData.get("note") || "").trim() || null;

  const row = await prisma.approvalFlow.findUnique({ where: { id } });
  if (!row || row.approverId !== user.id || row.status !== ApprovalStatus.PENDING) return;

  const siblings = await prisma.approvalFlow.findMany({
    where: { entityType: row.entityType, entityId: row.entityId },
    orderBy: { step: "asc" },
  });
  // Only the current step may act (all prior steps approved).
  if (siblings.some((s) => s.step < row.step && s.status !== ApprovalStatus.APPROVED)) return;

  await prisma.approvalFlow.update({
    where: { id },
    data: { status: decision === "APPROVED" ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED, note, decidedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: decision === "APPROVED" ? "APPROVE_STEP" : "REJECT_STEP",
    entityType: row.entityType,
    entityId: row.entityId,
    detail: { step: row.step },
  });

  const link = entityLink(row.entityType, row.entityId);
  if (decision === "REJECTED") {
    await createNotification({ userId: row.requestedById, title: "Yêu cầu phê duyệt bị từ chối", message: note ?? undefined, link });
  } else {
    const next = siblings.find((s) => s.step > row.step && s.status === ApprovalStatus.PENDING);
    if (next) {
      await createNotification({ userId: next.approverId, title: "Đến lượt bạn phê duyệt", message: `Bước ${next.step}`, link });
    } else {
      if (row.entityType === "report") {
        await prisma.selfAssessmentReport.update({ where: { id: row.entityId }, data: { status: ReportStatus.APPROVED } }).catch(() => {});
      }
      await createNotification({ userId: row.requestedById, title: "Yêu cầu phê duyệt đã hoàn tất", message: "Tất cả các bước đã phê duyệt.", link });
    }
  }
  revalidatePath("/approvals");
  revalidatePath(link);
}
