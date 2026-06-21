// Quality scoring engine (Phase 4). Deterministic, works without AI — it powers
// the Evidence Strength Score, per-criterion Accreditation Readiness, and the
// program-level AUN-QA 7-point rating. AI narrative is layered on top elsewhere.

import { prisma } from "../db";
import { EvidenceStatus, ReportSectionStatus, TaskStatus } from "@/generated/prisma/enums";
import type { BadgeColor } from "@/components/ui";

export type ScoreBand = "strong" | "adequate" | "weak" | "missing";

export const BAND_META: Record<ScoreBand, { label: string; color: BadgeColor }> = {
  strong: { label: "Mạnh", color: "green" },
  adequate: { label: "Đạt", color: "blue" },
  weak: { label: "Yếu", color: "amber" },
  missing: { label: "Thiếu", color: "red" },
};

// --------------------------------------------------------------------------
// Evidence Strength Score (0–100)
// --------------------------------------------------------------------------
export interface EvidenceForScore {
  status: EvidenceStatus;
  hasFile: boolean;
  isMachineReadable: boolean; // text was extracted (chunks exist)
  hasSummary: boolean; // AI/processed summary present
  criterionLinkCount: number;
}

const STATUS_POINTS: Record<EvidenceStatus, number> = {
  APPROVED: 30,
  USED_IN_REPORT: 30,
  REVIEWED: 22,
  SUBMITTED: 15,
  PROCESSING: 6,
  UPLOADED: 8,
  DRAFT: 6,
  NEEDS_REVISION: 3,
  ARCHIVED: 10,
};

export function evidenceStrength(e: EvidenceForScore): { score: number; band: ScoreBand; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (e.hasFile) score += 25;
  else reasons.push("Chưa đính kèm tệp minh chứng.");

  if (e.isMachineReadable) score += 20;
  else reasons.push("Tệp chưa trích xuất được nội dung (khó tra cứu/RAG).");

  if (e.hasSummary) score += 10;

  score += STATUS_POINTS[e.status] ?? 6;
  if (e.status === EvidenceStatus.NEEDS_REVISION) reasons.push("Minh chứng đang cần bổ sung/chỉnh sửa.");
  if (e.status !== EvidenceStatus.APPROVED && e.status !== EvidenceStatus.USED_IN_REPORT)
    reasons.push("Minh chứng chưa được phê duyệt.");

  if (e.criterionLinkCount > 0) score += 15;
  else reasons.push("Chưa gắn với tiêu chí kiểm định nào.");

  score = Math.max(0, Math.min(100, score));
  return { score, band: bandFor(score), reasons };
}

export function bandFor(score: number): ScoreBand {
  if (score >= 75) return "strong";
  if (score >= 50) return "adequate";
  if (score >= 25) return "weak";
  return "missing";
}

// --------------------------------------------------------------------------
// Reusable rubric checklist (used by SAR-quality and syllabus reviews)
// --------------------------------------------------------------------------
export interface QualityCheck {
  key: string;
  label: string;
  passed: boolean;
  weight: number;
  hint?: string;
}

export function scoreFromChecks(checks: QualityCheck[]): number {
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
  return total ? Math.round((got / total) * 100) : 0;
}

// --------------------------------------------------------------------------
// Criterion Readiness (0–100)
// --------------------------------------------------------------------------
export interface CriterionForScore {
  evidenceScores: number[];
  hasApprovedEvidence: boolean;
  sarStatus?: ReportSectionStatus | null;
  sarContentLength: number;
  sarHasAnalysisParts: boolean; // strengths + weaknesses + plan present
}

export function criterionReadiness(c: CriterionForScore): { score: number; band: ScoreBand; gaps: string[] } {
  const gaps: string[] = [];
  const count = c.evidenceScores.length;
  const avg = count ? c.evidenceScores.reduce((s, v) => s + v, 0) / count : 0;

  // Evidence component (0–50): blends quality (avg strength) and coverage (count saturates at 3).
  const quality = avg / 100;
  const coverage = Math.min(count, 3) / 3;
  const evidenceComponent = count ? 50 * (0.6 * quality + 0.4 * coverage) : 0;
  if (count === 0) gaps.push("Chưa có minh chứng liên kết.");
  else if (avg < 50) gaps.push(`Minh chứng còn yếu (điểm TB ${Math.round(avg)}/100).`);
  else if (count < 2) gaps.push("Chỉ có 1 minh chứng — nên bổ sung để củng cố.");

  // Approval component (0–20).
  const approvalComponent = c.hasApprovedEvidence ? 20 : count > 0 ? 6 : 0;
  if (count > 0 && !c.hasApprovedEvidence) gaps.push("Chưa có minh chứng được phê duyệt.");

  // SAR component (0–30).
  let sarComponent = 0;
  switch (c.sarStatus) {
    case ReportSectionStatus.DONE:
      sarComponent = 24;
      break;
    case ReportSectionStatus.REVIEW:
      sarComponent = 18;
      break;
    case ReportSectionStatus.DRAFTING:
      sarComponent = 10;
      break;
    default:
      sarComponent = 0;
  }
  if (c.sarContentLength > 400) sarComponent += 4;
  else if (c.sarContentLength > 150) sarComponent += 2;
  if (c.sarHasAnalysisParts) sarComponent += 2;
  sarComponent = Math.min(30, sarComponent);
  if (!c.sarStatus || c.sarStatus === ReportSectionStatus.NOT_STARTED)
    gaps.push("Mục báo cáo tự đánh giá (SAR) chưa được viết.");
  else if (c.sarStatus !== ReportSectionStatus.DONE) gaps.push("Mục SAR chưa hoàn thiện.");

  const score = Math.round(Math.max(0, Math.min(100, evidenceComponent + approvalComponent + sarComponent)));
  return { score, band: bandFor(score), gaps };
}

// --------------------------------------------------------------------------
// AUN-QA 7-point rating
// --------------------------------------------------------------------------
export interface AunRating {
  point: number; // 1–7
  label: string;
  color: BadgeColor;
  passed: boolean; // AUN-QA: ≥4 is "as expected"
}

export function aunRating(score: number): AunRating {
  let point: number;
  let label: string;
  let color: BadgeColor;
  if (score >= 90) {
    point = 7;
    label = "Xuất sắc (đẳng cấp)";
    color = "green";
  } else if (score >= 80) {
    point = 6;
    label = "Tốt hơn yêu cầu";
    color = "green";
  } else if (score >= 68) {
    point = 5;
    label = "Tốt hơn mức đáp ứng";
    color = "blue";
  } else if (score >= 55) {
    point = 4;
    label = "Đáp ứng yêu cầu";
    color = "blue";
  } else if (score >= 42) {
    point = 3;
    label = "Chưa đủ, cần cải thiện";
    color = "amber";
  } else if (score >= 28) {
    point = 2;
    label = "Chưa đáp ứng";
    color = "red";
  } else {
    point = 1;
    label = "Hoàn toàn chưa đáp ứng";
    color = "red";
  }
  return { point, label, color, passed: point >= 4 };
}

// --------------------------------------------------------------------------
// Program readiness report — aggregates everything for the latest cycle.
// --------------------------------------------------------------------------
export interface EvidenceRow {
  id: string;
  code: string;
  title: string;
  status: EvidenceStatus;
  score: number;
  band: ScoreBand;
}

export interface CriterionReadinessRow {
  id: string;
  code: string;
  title: string;
  evidenceCount: number;
  approvedCount: number;
  avgEvidenceStrength: number;
  sarStatus: ReportSectionStatus | null;
  score: number;
  band: ScoreBand;
  gaps: string[];
  evidence: EvidenceRow[];
}

export interface StandardReadiness {
  id: string;
  code: string;
  title: string;
  avgScore: number;
  aun: AunRating;
  criteria: CriterionReadinessRow[];
}

export interface ReadinessReport {
  cycleId: string;
  cycleName: string;
  standardSetName: string;
  overall: number;
  aun: AunRating;
  totals: {
    criteria: number;
    withEvidence: number;
    withApproved: number;
    sarDone: number;
    openTasks: number;
    overdueTasks: number;
  };
  evidenceBands: { strong: number; adequate: number; weak: number; missing: number; total: number };
  standards: StandardReadiness[];
}

const APPROVED: EvidenceStatus[] = [EvidenceStatus.APPROVED, EvidenceStatus.USED_IN_REPORT];

export async function getReadinessReport(programId: string): Promise<ReadinessReport | null> {
  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId },
    orderBy: { year: "desc" },
    include: {
      standardSet: {
        include: {
          standards: {
            orderBy: { order: "asc" },
            include: { criteria: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!cycle) return null;

  const criteria = cycle.standardSet.standards.flatMap((s) => s.criteria);
  const criterionIds = criteria.map((c) => c.id);

  const [links, sections, openTasks, overdueTasks] = await Promise.all([
    prisma.evidenceCriterionLink.findMany({
      where: { criterionId: { in: criterionIds }, evidence: { programId } },
      select: {
        criterionId: true,
        evidence: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            storagePath: true,
            criterionLinks: { select: { id: true } },
            document: { select: { summary: true, _count: { select: { chunks: true } } } },
          },
        },
      },
    }),
    prisma.reportSection.findMany({
      where: { report: { cycleId: cycle.id }, criterionId: { in: criterionIds } },
      select: { criterionId: true, status: true, content: true, strengths: true, weaknesses: true, improvementPlan: true },
    }),
    prisma.task.count({ where: { programId, status: { not: TaskStatus.DONE } } }),
    prisma.task.count({ where: { programId, status: { not: TaskStatus.DONE }, dueDate: { lt: new Date() } } }),
  ]);

  const linksByCriterion = new Map<string, typeof links>();
  for (const l of links) {
    const arr = linksByCriterion.get(l.criterionId) ?? [];
    arr.push(l);
    linksByCriterion.set(l.criterionId, arr);
  }
  const sectionByCriterion = new Map<string, (typeof sections)[number]>();
  for (const s of sections) if (s.criterionId) sectionByCriterion.set(s.criterionId, s);

  const evidenceBands = { strong: 0, adequate: 0, weak: 0, missing: 0, total: 0 };
  let withEvidence = 0;
  let withApproved = 0;
  let sarDone = 0;

  const standards: StandardReadiness[] = cycle.standardSet.standards.map((std) => {
    const rows: CriterionReadinessRow[] = std.criteria.map((c) => {
      const cl = linksByCriterion.get(c.id) ?? [];
      const evidence: EvidenceRow[] = cl.map((l) => {
        const ev = l.evidence;
        const s = evidenceStrength({
          status: ev.status,
          hasFile: Boolean(ev.storagePath),
          isMachineReadable: (ev.document?._count.chunks ?? 0) > 0,
          hasSummary: Boolean(ev.document?.summary),
          criterionLinkCount: ev.criterionLinks.length,
        });
        evidenceBands[s.band] += 1;
        evidenceBands.total += 1;
        return { id: ev.id, code: ev.code, title: ev.title, status: ev.status, score: s.score, band: s.band };
      });

      const approvedCount = cl.filter((l) => APPROVED.includes(l.evidence.status)).length;
      const sec = sectionByCriterion.get(c.id);
      const avgStrength = evidence.length
        ? Math.round(evidence.reduce((sum, e) => sum + e.score, 0) / evidence.length)
        : 0;

      const r = criterionReadiness({
        evidenceScores: evidence.map((e) => e.score),
        hasApprovedEvidence: approvedCount > 0,
        sarStatus: sec?.status ?? null,
        sarContentLength: (sec?.content ?? "").length,
        sarHasAnalysisParts: Boolean(sec?.strengths && sec?.weaknesses && sec?.improvementPlan),
      });

      if (evidence.length) withEvidence += 1;
      if (approvedCount > 0) withApproved += 1;
      if (sec?.status === ReportSectionStatus.DONE) sarDone += 1;

      return {
        id: c.id,
        code: c.code,
        title: c.title,
        evidenceCount: evidence.length,
        approvedCount,
        avgEvidenceStrength: avgStrength,
        sarStatus: sec?.status ?? null,
        score: r.score,
        band: r.band,
        gaps: r.gaps,
        evidence,
      };
    });

    const avgScore = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
    return { id: std.id, code: std.code, title: std.title, avgScore, aun: aunRating(avgScore), criteria: rows };
  });

  const overall = criteria.length
    ? Math.round(standards.flatMap((s) => s.criteria).reduce((s, r) => s + r.score, 0) / criteria.length)
    : 0;

  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    standardSetName: cycle.standardSet.name,
    overall,
    aun: aunRating(overall),
    totals: {
      criteria: criteria.length,
      withEvidence,
      withApproved,
      sarDone,
      openTasks,
      overdueTasks,
    },
    evidenceBands,
    standards,
  };
}
