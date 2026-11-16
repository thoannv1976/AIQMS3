"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { draftReportSection, reviewReportSection, reviewReportSectionAdvanced } from "@/lib/ai/features";
import { evidenceStrength } from "@/lib/quality/scoring";
import { assessSarQuality } from "@/lib/quality/sar";
import { sectionCriterionIds } from "@/lib/quality/sections";
import { createNotification } from "@/lib/notify";
import { checkCitations, extractCitationCodes, uncitedClaims, type CitationCheck } from "@/lib/sar/citations";
import { suggestInterviewQuestions } from "@/lib/ai/features";
import { validityState } from "@/lib/access";
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
    select: { reportId: true, report: { select: { cycle: { select: { programId: true } } } } },
  });
  // Edit history: one revision per save.
  await prisma.reportSectionRevision.create({
    data: {
      sectionId,
      content: fields.content || null,
      strengths: fields.strengths || null,
      weaknesses: fields.weaknesses || null,
      improvementPlan: fields.improvementPlan || null,
      status: fields.status,
      editedById: user.id,
    },
  });
  // Approved evidence cited in the text becomes "Đã dùng trong báo cáo".
  const cited = extractCitationCodes([fields.content, fields.strengths, fields.weaknesses, fields.improvementPlan].join("\n"));
  if (cited.length) {
    await prisma.evidence.updateMany({
      where: { programId: section.report.cycle.programId, code: { in: cited }, status: EvidenceStatus.APPROVED },
      data: { status: EvidenceStatus.USED_IN_REPORT },
    });
  }
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "ReportSection", entityId: sectionId });
  revalidatePath(`/reports/${section.reportId}`);
  return { ok: true };
}

async function evidenceForSection(sectionId: string) {
  const section = await prisma.reportSection.findUnique({
    where: { id: sectionId },
    include: { criterion: true, standard: true, report: { include: { cycle: true } } },
  });
  if (!section) return null;

  const evidenceSummaries: string[] = [];
  let linkedEvidenceCount = 0;
  const excluded: string[] = [];
  const critIds = await sectionCriterionIds(section);
  if (critIds.length) {
    const links = await prisma.evidenceCriterionLink.findMany({
      where: { criterionId: { in: critIds }, evidence: { programId: section.report.cycle.programId } },
      distinct: ["evidenceId"],
      include: { evidence: { include: { document: true } } },
    });
    linkedEvidenceCount = links.length;
    // SAR drafts may only rest on approved, still-valid evidence ("minh chứng trước – nhận định sau").
    for (const l of links) {
      const e = l.evidence;
      const approved = e.status === EvidenceStatus.APPROVED || e.status === EvidenceStatus.USED_IN_REPORT;
      const expired = validityState(e.validUntil) === "expired";
      if (approved && !expired) {
        evidenceSummaries.push(`${e.code} — ${e.title}: ${e.document?.summary || e.description || (e.document?.extractedText ?? "").slice(0, 600)}`);
      } else {
        excluded.push(`${e.code} (${expired ? "hết hiệu lực" : "chưa duyệt"})`);
      }
    }
  }
  return { section, evidenceSummaries, linkedEvidenceCount, excluded, critIds };
}

export async function draftSectionAction(sectionId: string): Promise<{ text: string; usedFallback: boolean; excluded?: string[] }> {
  const user = await requireUser();
  const ctx = await evidenceForSection(sectionId);
  if (!ctx) return { text: "Không tìm thấy mục báo cáo.", usedFallback: true };

  const res = await draftReportSection({
    // A standard-level section is drafted for the whole standard, not just its first criterion.
    criterionCode: ctx.section.standard ? `Tiêu chuẩn ${ctx.section.standard.code}` : ctx.section.criterion?.code,
    criterionTitle: ctx.section.standard?.title ?? ctx.section.criterion?.title ?? ctx.section.title,
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
  return { text: res.text, usedFallback: res.usedFallback, excluded: ctx.excluded };
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

  const critIds = await sectionCriterionIds(section);
  if (critIds.length) {
    const links = await prisma.evidenceCriterionLink.findMany({
      where: { criterionId: { in: critIds }, evidence: { programId: section.report.cycle.programId } },
      distinct: ["evidenceId"],
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

  // Citation check feeds the AI review: bad/unapproved citations and uncited claims.
  const fullText = [section.content, section.strengths, section.weaknesses, section.improvementPlan].filter(Boolean).join("\n");
  const citationIssues = (await checkCitations(section.report.cycle.programId, critIds, fullText))
    .filter((c) => !c.ok)
    .map((c) => `Trích dẫn [${c.code}]: ${c.problem}`);
  const claimIssues = uncitedClaims(fullText, 3).map((t) => `Nhận định chưa có trích dẫn: "${t.slice(0, 120)}"`);

  const res = await reviewReportSectionAdvanced(
    {
      title: section.title,
      content: section.content,
      strengths: section.strengths,
      weaknesses: section.weaknesses,
      improvementPlan: section.improvementPlan,
      qualityScore: quality.score,
      failedChecks: [...quality.checks.filter((c) => !c.passed).map((c) => c.label), ...citationIssues, ...claimIssues],
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

/** Assign writer (assignedTo) and reviewer for a SAR section; notifies newly assigned users. */
export async function assignSectionAction(sectionId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "report:write")) return;
  const assignedToId = String(formData.get("assignedToId") || "") || null;
  const reviewerId = String(formData.get("reviewerId") || "") || null;
  const before = await prisma.reportSection.findUnique({ where: { id: sectionId }, select: { assignedToId: true, reviewerId: true } });
  if (!before) return;
  const section = await prisma.reportSection.update({
    where: { id: sectionId },
    data: { assignedToId, reviewerId },
    select: { reportId: true, title: true },
  });
  await logAudit({ userId: user.id, action: "ASSIGN", entityType: "ReportSection", entityId: sectionId, detail: { assignedToId, reviewerId } });
  const link = `/reports/${section.reportId}`;
  if (assignedToId && assignedToId !== before.assignedToId) {
    await createNotification({ userId: assignedToId, title: "Bạn được phân công viết mục báo cáo tự đánh giá", message: section.title, link });
  }
  if (reviewerId && reviewerId !== before.reviewerId) {
    await createNotification({ userId: reviewerId, title: "Bạn được phân công phản biện mục báo cáo tự đánh giá", message: section.title, link });
  }
  revalidatePath(link);
}


// ============================ Citations, history, versions, interview questions ============================

export interface CitationReport {
  checks: CitationCheck[];
  uncited: string[];
}

/** Check the [MC-…] codes cited in the (possibly unsaved) section text. */
export async function checkCitationsAction(sectionId: string, text: string): Promise<CitationReport> {
  await requireUser();
  const section = await prisma.reportSection.findUnique({
    where: { id: sectionId },
    include: { report: { include: { cycle: { select: { programId: true } } } } },
  });
  if (!section) return { checks: [], uncited: [] };
  const critIds = await sectionCriterionIds(section);
  return { checks: await checkCitations(section.report.cycle.programId, critIds, text), uncited: uncitedClaims(text) };
}

export interface RevisionDto {
  id: string;
  createdAt: string;
  editor: string | null;
  status: ReportSectionStatus;
  content: string | null;
  strengths: string | null;
  weaknesses: string | null;
  improvementPlan: string | null;
}

export async function listSectionRevisionsAction(sectionId: string): Promise<RevisionDto[]> {
  const user = await requireUser();
  if (!can(user.role, "report:view")) return [];
  const rows = await prisma.reportSectionRevision.findMany({
    where: { sectionId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { editedBy: { select: { fullName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    editor: r.editedBy?.fullName ?? null,
    status: r.status,
    content: r.content,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    improvementPlan: r.improvementPlan,
  }));
}

/** "Chốt phiên bản": freeze a snapshot of every section of the report. */
export async function freezeReportVersionAction(reportId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "report:write")) return;
  const report = await prisma.selfAssessmentReport.findUnique({
    where: { id: reportId },
    include: { sections: { orderBy: { order: "asc" } }, versions: { select: { id: true } } },
  });
  if (!report) return;
  const label = `v${report.versions.length + 1}`;
  await prisma.reportVersion.create({
    data: {
      reportId,
      label,
      note: String(formData.get("note") || "").trim() || null,
      createdById: user.id,
      snapshot: report.sections.map((s) => ({
        sectionId: s.id,
        title: s.title,
        content: s.content,
        strengths: s.strengths,
        weaknesses: s.weaknesses,
        improvementPlan: s.improvementPlan,
        status: s.status,
      })),
    },
  });
  await logAudit({ userId: user.id, action: "FREEZE_VERSION", entityType: "SelfAssessmentReport", entityId: reportId, detail: { label } });
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/reports/${reportId}/versions`);
}

/** AI: suggested external-review interview questions for a report. */
export async function interviewQuestionsAction(reportId: string): Promise<{ text: string; usedFallback: boolean }> {
  const user = await requireUser();
  if (!can(user.role, "ai:use")) return { text: "Bạn không có quyền dùng AI.", usedFallback: true };
  const report = await prisma.selfAssessmentReport.findUnique({
    where: { id: reportId },
    include: {
      cycle: { include: { program: true, standardSet: true } },
      sections: { orderBy: { order: "asc" }, include: { criterion: true, standard: { include: { criteria: { select: { id: true } } } } } },
    },
  });
  if (!report) return { text: "Không tìm thấy báo cáo.", usedFallback: true };
  const links = await prisma.evidenceCriterionLink.groupBy({
    by: ["criterionId"],
    where: { evidence: { programId: report.cycle.programId } },
    _count: { _all: true },
  });
  const count = new Map(links.map((l) => [l.criterionId, l._count._all]));
  const res = await suggestInterviewQuestions(
    {
      programName: `${report.cycle.program.code} — ${report.cycle.program.nameVi}`,
      standardSet: report.cycle.standardSet.name,
      sections: report.sections.map((s) => ({
        title: s.title.slice(0, 140),
        weaknesses: s.weaknesses,
        content: s.content,
        evidenceCount: s.standard
          ? s.standard.criteria.reduce((a, c) => a + (count.get(c.id) ?? 0), 0)
          : s.criterionId
            ? (count.get(s.criterionId) ?? 0)
            : 0,
      })),
    },
    { userId: user.id },
  );
  await prisma.aiAnalysisResult.create({
    data: {
      type: AiAnalysisType.INTERVIEW_QUESTIONS,
      targetType: "report",
      targetId: reportId,
      result: res.text,
      model: res.model,
      usedFallback: res.usedFallback,
      createdById: user.id,
    },
  });
  await logAudit({ userId: user.id, action: "AI_INTERVIEW_QUESTIONS", entityType: "SelfAssessmentReport", entityId: reportId });
  revalidatePath(`/reports/${reportId}`);
  return { text: res.text, usedFallback: res.usedFallback };
}
