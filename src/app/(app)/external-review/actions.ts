"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { draftRecommendationResponse } from "@/lib/ai/features";
import { PdcaStatus, TaskPriority } from "@/generated/prisma/enums";

export interface FormState {
  error?: string;
  ok?: boolean;
}

const PRIORITIES = Object.values(TaskPriority) as string[];
const PDCA = Object.values(PdcaStatus) as string[];

export async function createRecommendationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "improvement:write")) return { error: "Bạn không có quyền ghi nhận khuyến nghị." };

  const programId = String(formData.get("programId") || "");
  const content = String(formData.get("content") || "").trim();
  const assessor = String(formData.get("assessor") || "").trim() || null;
  const responsibleUnit = String(formData.get("responsibleUnit") || "").trim() || null;
  const criterionId = String(formData.get("criterionId") || "") || null;
  const priorityRaw = String(formData.get("priority") || "MEDIUM");
  const priority = (PRIORITIES.includes(priorityRaw) ? priorityRaw : "MEDIUM") as TaskPriority;
  const dueRaw = String(formData.get("dueDate") || "");
  const dueDate = dueRaw ? new Date(dueRaw) : null;

  if (!programId || !content) return { error: "Vui lòng chọn chương trình và nhập nội dung khuyến nghị." };

  const cycle = await prisma.accreditationCycle.findFirst({ where: { programId }, orderBy: { year: "desc" } });
  if (!cycle) return { error: "Chương trình chưa có chu kỳ kiểm định để gắn khuyến nghị." };

  const rec = await prisma.recommendation.create({
    data: { cycleId: cycle.id, criterionId, content, assessor, responsibleUnit, priority, dueDate, status: PdcaStatus.PLAN },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Recommendation", entityId: rec.id, detail: { content } });
  revalidatePath("/external-review");
  return { ok: true };
}

export async function respondRecommendationAction(id: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "improvement:write")) return;
  const response = String(formData.get("response") || "").trim() || null;
  const statusRaw = String(formData.get("status") || "PLAN");
  const status = (PDCA.includes(statusRaw) ? statusRaw : "PLAN") as PdcaStatus;

  await prisma.recommendation.update({
    where: { id },
    data: { response, status, respondedAt: response ? new Date() : null },
  });
  await logAudit({ userId: user.id, action: "RESPOND", entityType: "Recommendation", entityId: id, detail: { status } });
  revalidatePath("/external-review");
}

export async function draftResponseAction(id: string): Promise<{ text: string; usedFallback: boolean }> {
  const user = await requireUser();
  const rec = await prisma.recommendation.findUnique({ where: { id }, include: { criterion: true } });
  if (!rec) return { text: "Không tìm thấy khuyến nghị.", usedFallback: true };

  const res = await draftRecommendationResponse(
    { content: rec.content, criterionTitle: rec.criterion?.title, priority: rec.priority },
    { userId: user.id },
  );
  await logAudit({ userId: user.id, action: "AI_DRAFT_RESPONSE", entityType: "Recommendation", entityId: id });
  return { text: res.text, usedFallback: res.usedFallback };
}
