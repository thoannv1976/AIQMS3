"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { draftReportSection, reviewReportSection } from "@/lib/ai/features";
import { AiAnalysisType, ReportSectionStatus, ReportStatus } from "@/generated/prisma/enums";

export async function setReportStatusAction(reportId: string, status: ReportStatus): Promise<void> {
  const user = await requireUser();
  const approving = status === ReportStatus.APPROVED || status === ReportStatus.PUBLISHED;
  if (approving && !can(user.role, "report:approve")) return;
  if (!approving && !can(user.role, "report:write")) return;
  await prisma.selfAssessmentReport.update({ where: { id: reportId }, data: { status } });
  await logAudit({ userId: user.id, action: "UPDATE_STATUS", entityType: "SelfAssessmentReport", entityId: reportId, detail: { status } });
  revalidatePath(`/reports/${reportId}`);
}

export async function saveSectionAction(
  sectionId: string,
  fields: { content: string; strengths: string; weaknesses: string; improvementPlan: string; status: ReportSectionStatus },
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!can(user.role, "report:write")) return { ok: false, error: "Không có quyền." };

  const section = await prisma.reportSection.update({
    where: { id: sectionId },
    data: {
      content: fields.content || null,
      strengths: fields.strengths || null,
      weaknesses: fields.weaknesses || null,
      improvementPlan: fields.improvementPlan || null,
      status: fields.status,
    },
    select: { reportId: true },
  });
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "ReportSection", entityId: sectionId });
  revalidatePath(`/reports/${section.reportId}`);
  return { ok: true };
}

async function evidenceForSection(sectionId: string) {
  const section = await prisma.reportSection.findUnique({
    where: { id: sectionId },
    include: { criterion: true, report: { include: { cycle: true } } },
  });
  if (!section) return null;

  let evidenceSummaries: string[] = [];
  let linkedEvidenceCount = 0;
  if (section.criterionId) {
    const links = await prisma.evidenceCriterionLink.findMany({
      where: { criterionId: section.criterionId, evidence: { programId: section.report.cycle.programId } },
      include: { evidence: { include: { document: true } } },
    });
    linkedEvidenceCount = links.length;
    evidenceSummaries = links.map(
      (l) => `${l.evidence.code} — ${l.evidence.title}: ${l.evidence.document?.summary || l.evidence.description || ""}`,
    );
  }
  return { section, evidenceSummaries, linkedEvidenceCount };
}

export async function draftSectionAction(sectionId: string): Promise<{ text: string; usedFallback: boolean }> {
  const user = await requireUser();
  const ctx = await evidenceForSection(sectionId);
  if (!ctx) return { text: "Không tìm thấy mục báo cáo.", usedFallback: true };

  const res = await draftReportSection({
    criterionCode: ctx.section.criterion?.code,
    criterionTitle: ctx.section.criterion?.title ?? ctx.section.title,
    evidenceSummaries: ctx.evidenceSummaries,
  }, { userId: user.id });

  await prisma.aiAnalysisResult.create({
    data: {
      type: AiAnalysisType.SAR_DRAFT,
      targetType: "report_section",
      targetId: sectionId,
      result: res.text,
      model: res.model,
      usedFallback: res.usedFallback,
      createdById: user.id,
    },
  });
  await logAudit({ userId: user.id, action: "AI_SAR_DRAFT", entityType: "ReportSection", entityId: sectionId });
  return { text: res.text, usedFallback: res.usedFallback };
}

export async function reviewSectionAction(sectionId: string): Promise<{ text: string; usedFallback: boolean }> {
  const user = await requireUser();
  const ctx = await evidenceForSection(sectionId);
  if (!ctx) return { text: "Không tìm thấy mục báo cáo.", usedFallback: true };

  const res = await reviewReportSection({
    title: ctx.section.title,
    content: ctx.section.content,
    strengths: ctx.section.strengths,
    weaknesses: ctx.section.weaknesses,
    improvementPlan: ctx.section.improvementPlan,
    linkedEvidenceCount: ctx.linkedEvidenceCount,
  }, { userId: user.id });

  await prisma.aiAnalysisResult.create({
    data: {
      type: AiAnalysisType.SAR_REVIEW,
      targetType: "report_section",
      targetId: sectionId,
      result: res.text,
      model: res.model,
      usedFallback: res.usedFallback,
      createdById: user.id,
    },
  });
  await logAudit({ userId: user.id, action: "AI_SAR_REVIEW", entityType: "ReportSection", entityId: sectionId });
  return { text: res.text, usedFallback: res.usedFallback };
}
