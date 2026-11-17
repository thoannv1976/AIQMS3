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
import { evidenceContextBlocks, programFactLines, type EvidenceLite } from "@/lib/sar/excerpts";
import { splitSarDraft } from "@/lib/sar/draft";
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

  let evidenceSummaries: string[] = [];
  let linkedEvidenceCount = 0;
  const excluded: string[] = [];
  const critIds = await sectionCriterionIds(section);
  if (critIds.length) {
    const links = await prisma.evidenceCriterionLink.findMany({
      where: { criterionId: { in: critIds }, evidence: { programId: section.report.cycle.programId } },
      distinct: ["evidenceId"],
      include: { evidence: { select: { id: true, code: true, title: true, status: true, validUntil: true, providerUnit: true, issuedAt: true, description: true } } },
    });
    linkedEvidenceCount = links.length;
    // SAR drafts may only rest on approved, still-valid evidence ("minh chứng trước – nhận định sau").
    const usable: EvidenceLite[] = [];
    for (const l of links) {
      const e = l.evidence;
      const approved = e.status === EvidenceStatus.APPROVED || e.status === EvidenceStatus.USED_IN_REPORT;
      const expired = validityState(e.validUntil) === "expired";
      if (approved && !expired) usable.push(e);
      else excluded.push(`${e.code} (${expired ? "hết hiệu lực" : "chưa duyệt"})`);
    }
    usable.sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true }));
    // Full-text passages (ranked for the criterion, figures first) instead of one-line summaries.
    const query = [section.standard?.title, section.criterion?.title, section.title].filter(Boolean).join(" ");
    evidenceSummaries = await evidenceContextBlocks(usable, query);
  }
  const facts = await programFactLines(section.report.cycle.programId);
  return { section, evidenceSummaries, linkedEvidenceCount, excluded, critIds, facts };
}

export async function draftSectionAction(sectionId: string): Promise<{ text: string; usedFallback: boolean; excluded?: string[]; blockedReason?: string }> {
  const user = await requireUser();
  const ctx = await evidenceForSection(sectionId);
  if (!ctx) return { text: "Không tìm thấy mục báo cáo.", usedFallback: true };

  const res = await draftReportSection({
    // A standard-level section is drafted for the whole standard, not just its first criterion.
    criterionCode: ctx.section.standard ? `Tiêu chuẩn ${ctx.section.standard.code}` : ctx.section.criterion?.code,
    criterionTitle: ctx.section.standard?.title ?? ctx.section.criterion?.title ?? ctx.section.title,
    evidenceSummaries: ctx.evidenceSummaries,
    facts: ctx.facts,
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
  return { text: res.text, usedFallback: res.usedFallback, excluded: ctx.excluded, blockedReason: res.blockedReason };
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

  // Citation check feeds both the score and the AI review: bad/unapproved citations and uncited claims.
  const fullText = [section.content, section.strengths, section.weaknesses, section.improvementPlan].filter(Boolean).join("\n");
  const citations = await checkCitations(section.report.cycle.programId, critIds, fullText);
  const badCitations = citations.filter((c) => !c.ok);
  const uncited = uncitedClaims(fullText);
  const citationIssues = badCitations.map((c) => `Trích dẫn [${c.code}]: ${c.problem}`);
  const claimIssues = uncited.slice(0, 3).map((t) => `Nhận định chưa có trích dẫn: "${t.slice(0, 120)}"`);

  const quality = assessSarQuality({
    content: section.content,
    strengths: section.strengths,
    weaknesses: section.weaknesses,
    improvementPlan: section.improvementPlan,
    linkedEvidenceCount,
    approvedEvidenceCount,
    avgEvidenceStrength,
    citations: { total: citations.length, invalid: badCitations.length, uncitedClaims: uncited.length },
  });

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

// ============================ Bulk tools (assignment, AI drafting of the whole report) ============================

/** Assign writer/reviewer to every section of each standard in one go. */
export async function bulkAssignSectionsAction(
  reportId: string,
  rows: Array<{ standardId: string; assignedToId: string | null; reviewerId: string | null }>,
  overwrite: boolean,
): Promise<{ ok: boolean; updated: number; error?: string }> {
  const user = await requireUser();
  if (!can(user.role, "report:write")) return { ok: false, updated: 0, error: "Không có quyền." };
  const sections = await prisma.reportSection.findMany({
    where: { reportId },
    select: { id: true, standardId: true, criterion: { select: { standardId: true } }, assignedToId: true, reviewerId: true },
  });
  const tally = new Map<string, { writer: number; reviewer: number }>();
  let updated = 0;
  for (const row of rows) {
    if (!row.assignedToId && !row.reviewerId) continue;
    for (const s of sections.filter((x) => (x.standardId ?? x.criterion?.standardId) === row.standardId)) {
      const data: { assignedToId?: string; reviewerId?: string } = {};
      if (row.assignedToId && (overwrite || !s.assignedToId) && s.assignedToId !== row.assignedToId) data.assignedToId = row.assignedToId;
      if (row.reviewerId && (overwrite || !s.reviewerId) && s.reviewerId !== row.reviewerId) data.reviewerId = row.reviewerId;
      if (!data.assignedToId && !data.reviewerId) continue;
      await prisma.reportSection.update({ where: { id: s.id }, data });
      updated++;
      for (const [uid, kind] of [[data.assignedToId, "writer"], [data.reviewerId, "reviewer"]] as const) {
        if (!uid) continue;
        const t = tally.get(uid) ?? { writer: 0, reviewer: 0 };
        t[kind]++;
        tally.set(uid, t);
      }
    }
  }
  const link = `/reports/${reportId}`;
  for (const [uid, t] of tally) {
    const parts = [t.writer ? `viết ${t.writer} mục` : "", t.reviewer ? `phản biện ${t.reviewer} mục` : ""].filter(Boolean).join(", ");
    await createNotification({ userId: uid, title: "Bạn được phân công trong báo cáo tự đánh giá", message: parts, link });
  }
  await logAudit({ userId: user.id, action: "BULK_ASSIGN", entityType: "SelfAssessmentReport", entityId: reportId, detail: { rows, overwrite, updated } });
  revalidatePath(link);
  return { ok: true, updated };
}

export type BatchDraftOutcome =
  | { status: "done"; citations: number; needData: number; excluded: number }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string; stop?: boolean };

/** Draft one section with AI and save it straight into the four fields (used by the whole-report runner). */
export async function draftAndSaveSectionAction(
  sectionId: string,
  opts: { overwrite: boolean; status: ReportSectionStatus },
): Promise<BatchDraftOutcome> {
  const user = await requireUser();
  if (!can(user.role, "report:write") || !can(user.role, "ai:use")) return { status: "error", reason: "Không có quyền" };
  try {
    const existing = await prisma.reportSection.findUnique({ where: { id: sectionId }, select: { content: true, strengths: true, weaknesses: true, improvementPlan: true } });
    if (!existing) return { status: "error", reason: "Không tìm thấy mục" };
    const hasText = [existing.content, existing.strengths, existing.weaknesses, existing.improvementPlan].some((x) => x && x.trim());
    if (hasText && !opts.overwrite) return { status: "skipped", reason: "Đã có nội dung" };
    const draft = await draftSectionAction(sectionId);
    if (draft.blockedReason) return { status: "error", reason: draft.blockedReason, stop: true };
    if (draft.usedFallback) return { status: "error", reason: "AI chưa sẵn sàng (đang dùng bản dự phòng)" };
    const f = splitSarDraft(draft.text);
    const res = await saveSectionAction(sectionId, { ...f, status: opts.status });
    if (!res.ok) return { status: "error", reason: res.error ?? "Không lưu được" };
    const all = [f.content, f.strengths, f.weaknesses, f.improvementPlan].join("\n");
    return {
      status: "done",
      citations: extractCitationCodes(all).length,
      needData: (all.match(/cần bổ sung số liệu/gi) ?? []).length,
      excluded: draft.excluded?.length ?? 0,
    };
  } catch (e) {
    return { status: "error", reason: e instanceof Error ? e.message.slice(0, 160) : "Lỗi" };
  }
}
