"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { analyzeCriterionGap } from "@/lib/ai/features";
import { evidenceStrength, criterionReadiness } from "@/lib/quality/scoring";
import { evidenceStatus as evStatusMeta, reportSectionStatus } from "@/lib/labels";
import { AiAnalysisType, EvidenceStatus } from "@/generated/prisma/enums";

const APPROVED: EvidenceStatus[] = [EvidenceStatus.APPROVED, EvidenceStatus.USED_IN_REPORT];

export async function criterionGapAnalysisAction(
  programId: string,
  criterionId: string,
): Promise<{ text: string; usedFallback: boolean }> {
  const user = await requireUser();

  const criterion = await prisma.criterion.findUnique({
    where: { id: criterionId },
    select: { id: true, code: true, title: true },
  });
  if (!criterion) return { text: "Không tìm thấy tiêu chí.", usedFallback: true };

  const [links, cycle] = await Promise.all([
    prisma.evidenceCriterionLink.findMany({
      where: { criterionId, evidence: { programId } },
      select: {
        evidence: {
          select: {
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
    prisma.accreditationCycle.findFirst({ where: { programId }, orderBy: { year: "desc" }, select: { id: true } }),
  ]);

  const section = cycle
    ? await prisma.reportSection.findFirst({
        where: { criterionId, report: { cycleId: cycle.id } },
        select: { status: true, content: true, strengths: true, weaknesses: true, improvementPlan: true },
      })
    : null;

  const evidence = links.map((l) => {
    const ev = l.evidence;
    const s = evidenceStrength({
      status: ev.status,
      hasFile: Boolean(ev.storagePath),
      isMachineReadable: (ev.document?._count.chunks ?? 0) > 0,
      hasSummary: Boolean(ev.document?.summary),
      criterionLinkCount: ev.criterionLinks.length,
    });
    return {
      code: ev.code,
      title: ev.title,
      statusLabel: evStatusMeta[ev.status].label,
      strength: s.score,
    };
  });

  const readiness = criterionReadiness({
    evidenceScores: evidence.map((e) => e.strength),
    hasApprovedEvidence: links.some((l) => APPROVED.includes(l.evidence.status)),
    sarStatus: section?.status ?? null,
    sarContentLength: (section?.content ?? "").length,
    sarHasAnalysisParts: Boolean(section?.strengths && section?.weaknesses && section?.improvementPlan),
  });

  const res = await analyzeCriterionGap(
    {
      criterionCode: criterion.code,
      criterionTitle: criterion.title,
      readinessScore: readiness.score,
      sarStatusLabel: section ? reportSectionStatus[section.status].label : "Chưa có mục SAR",
      evidence,
      detectedGaps: readiness.gaps,
    },
    { userId: user.id },
  );

  await prisma.aiAnalysisResult.create({
    data: {
      type: AiAnalysisType.GAP_ANALYSIS,
      targetType: "criterion",
      targetId: criterionId,
      result: res.text,
      model: res.model,
      usedFallback: res.usedFallback,
      createdById: user.id,
    },
  });
  await logAudit({ userId: user.id, action: "AI_GAP_ANALYSIS", entityType: "Criterion", entityId: criterionId, detail: { programId } });

  return { text: res.text, usedFallback: res.usedFallback };
}
