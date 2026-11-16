"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { suggestImprovements } from "@/lib/ai/features";
import { PdcaStatus, AiAnalysisType, ImprovementPhase } from "@/generated/prisma/enums";

export interface FormState {
  error?: string;
}

export async function createImprovement(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "improvement:write")) return { error: "Bạn không có quyền." };

  const programId = String(formData.get("programId") || "");
  const problem = String(formData.get("problem") || "").trim();
  const rootCause = String(formData.get("rootCause") || "").trim() || null;
  const action = String(formData.get("action") || "").trim() || null;
  const responsibleUnit = String(formData.get("responsibleUnit") || "").trim() || null;
  const kpi = String(formData.get("kpi") || "").trim() || null;
  const source = String(formData.get("source") || "").trim() || null;
  const criterionId = String(formData.get("criterionId") || "") || null;
  const dueRaw = String(formData.get("dueDate") || "");
  const dueDate = dueRaw ? new Date(dueRaw) : null;

  if (!programId || !problem) return { error: "Vui lòng nhập chương trình và vấn đề cần cải tiến." };

  const cycle = await prisma.accreditationCycle.findFirst({ where: { programId }, orderBy: { year: "desc" } });

  await prisma.improvementPlan.create({
    data: { programId, cycleId: cycle?.id ?? null, criterionId, problem, rootCause, action, responsibleUnit, kpi, source, dueDate, status: PdcaStatus.PLAN },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "ImprovementPlan", detail: { problem } });
  revalidatePath("/improvements");
  redirect(`/improvements?program=${programId}`);
}

export async function updateImprovementStatusAction(id: string, status: PdcaStatus): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "improvement:write")) return;
  await prisma.improvementPlan.update({ where: { id }, data: { status } });
  await logAudit({ userId: user.id, action: "UPDATE_STATUS", entityType: "ImprovementPlan", entityId: id, detail: { status } });
  revalidatePath("/improvements");
}

export async function linkImprovementEvidenceAction(improvementId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "improvement:write")) return;
  const evidenceId = String(formData.get("evidenceId") || "");
  const phase = String(formData.get("phase") || "") as ImprovementPhase;
  if (!evidenceId || (phase !== ImprovementPhase.BEFORE && phase !== ImprovementPhase.AFTER)) return;
  await prisma.improvementEvidenceLink.upsert({
    where: { improvementId_evidenceId_phase: { improvementId, evidenceId, phase } },
    update: {},
    create: { improvementId, evidenceId, phase },
  });
  await logAudit({
    userId: user.id,
    action: "LINK_IMPROVEMENT_EVIDENCE",
    entityType: "ImprovementPlan",
    entityId: improvementId,
    detail: { evidenceId, phase },
  });
  revalidatePath("/improvements");
}

export async function unlinkImprovementEvidenceAction(linkId: string): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "improvement:write")) return;
  await prisma.improvementEvidenceLink.deleteMany({ where: { id: linkId } });
  revalidatePath("/improvements");
}

export async function suggestImprovementAction(problem: string, criterionTitle?: string): Promise<{ text: string; usedFallback: boolean }> {
  const user = await requireUser();
  if (!problem.trim()) return { text: "Hãy nhập vấn đề cần cải tiến trước.", usedFallback: true };
  const res = await suggestImprovements({ problem, criterionTitle }, { userId: user.id });
  await prisma.aiAnalysisResult.create({
    data: { type: AiAnalysisType.IMPROVEMENT_SUGGESTION, targetType: "improvement", result: res.text, model: res.model, usedFallback: res.usedFallback, createdById: user.id },
  });
  return { text: res.text, usedFallback: res.usedFallback };
}
