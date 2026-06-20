"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { draftReportSection, reviewReportSection, reviewReportSectionAdvanced } from "@/lib/ai/features";
import { evidenceStrength } from "@/lib/quality/scoring";
import { assessSarQuality } from "@/lib/quality/sar";
import { AiAnalysisType, EvidenceStatus, ReportSectionStatus, ReportStatus } from "@/generated/prisma/enums";

const APPROVED_EV: EvidenceStatus[] = [EvidenceStatus.APPROVED, EvidenceStatus.USED_IN_REPORT];

export interface SarQualityCheckDto {
  label: string;
  passed: boolean;
  hint?: string;
}
export interface AdvancedReviewResult {
  text: string;
  usedFallback: boolean;
  quality: { score: number; band: string; checks: SarQualityCheckDto[] };
}

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

// Advanced, quality-scored SAR review with evidence-strength awareness.
export async function reviewSectionAdvancedAction(sectionId: string): Promise<AdvancedReviewResult> {
  const user = await requireUser();
  const empty: AdvancedReviewResult = {
    text: "Không tìm thấy mục báo cáo.",
    usedFallback: true,
    quality: { score: 0, band: "missing", checks: [] },
  };

  const section = await prisma.reportSection.findUnique({
    where: { id: sectionId },
    include: { criterion: true, report: { include: { cycle: true } } },
  });
  if (!section) return empty;

  let linkedEvidenceCount = 0;
  let approvedEvidenceCount = 0;
  let avgEvidenceStrength = 0;
  const evidenceSummaries: string[] = [];

  if (section.criterionId) {
    const links = await prisma.evidenceCriterionLink.findMany({
      where: { criterionId: section.criterionId, evidence: { programId: section.report.cycle.programId } },
      select: {
        evidence: {
          select: {
            code: true,
            title: true,
            description: true,
            status: true,
            storagePath: true,
            criterionLinks: { select: { id: true } },
            document: { select: { summary: true, _count: { select: { chunks: true } } } },
          },
        },
      },
    });
    linkedEvidenceCount = links.length;
    const strengths = links.map((l) => {
      const ev = l.evidence;
      if (APPROVED_EV.includes(ev.status)) approvedEvidenceCount += 1;
      evidenceSummaries.push(`${ev.code} — ${ev.title}: ${ev.document?.summary || ev.description || ""}`);
      return evidenceStrength({
        status: ev.status,
        hasFile: Boolean(ev.storagePath),
        isMachineReadable: (ev.document?._count.chunks ?? 0) > 0,
        hasSummary: Boolean(ev.document?.summary),
        criterionLinkCount: ev.criterionLinks.length,
      }).score;
    });
    avgEvidenceStrength = strengths.length ? Math.round(strengths.reduce((s, v) => s + v, 0) / strengths.length) : 0;
  }

  const quality = assessSarQuality({
    content: section.content,
    strengths: section.strengths,
    weaknesses: section.weaknesses,
    improvementPlan: section.improvementPlan,
    linkedEvidenceCount,
    approvedEvidenceCount,
    avgEvidenceStrength,
  });

  const res = await reviewReportSectionAdvanced(
    {
      title: section.title,
      content: section.content,
      strengths: section.strengths,
      weaknesses: section.weaknesses,
      improvementPlan: section.improvementPlan,
      qualityScore: quality.score,
      failedChecks: quality.checks.filter((c) => !c.passed).map((c) => c.label),
      evidenceSummaries,
    },
    { userId: user.id },
  );

  await prisma.aiAnalysisResult.create({
    data: {
      type: AiAnalysisType.SAR_REVIEW,
      targetType: "report_section",
      targetId: sectionId,
      result: res.text,
      data: { qualityScore: quality.score, band: quality.band },
      model: res.model,
      usedFallback: res.usedFallback,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "AI_SAR_REVIEW_ADV",
    entityType: "ReportSection",
    entityId: sectionId,
    detail: { qualityScore: quality.score },
  });

  return {
    text: res.text,
    usedFallback: res.usedFallback,
    quality: {
      score: quality.score,
      band: quality.band,
      checks: quality.checks.map((c) => ({ label: c.label, passed: c.passed, hint: c.hint })),
    },
  };
}
