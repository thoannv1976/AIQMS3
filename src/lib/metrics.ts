import { prisma } from "./db";
import { EvidenceStatus, TaskStatus, ReportSectionStatus } from "@/generated/prisma/enums";

export interface ProgramStats {
  totalCriteria: number;
  coveredCriteria: number;
  approvedCriteria: number;
  evidenceCount: number;
  readiness: number; // % criteria with at least one evidence
  approvedReadiness: number; // % criteria with approved evidence
  reportProgress: number; // % report sections done
  openTasks: number;
  overdueTasks: number;
}

const APPROVED_STATUSES: EvidenceStatus[] = [EvidenceStatus.APPROVED, EvidenceStatus.USED_IN_REPORT];

export async function getProgramStats(programId: string): Promise<ProgramStats> {
  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId },
    orderBy: { year: "desc" },
    include: { standardSet: { include: { standards: { include: { criteria: { select: { id: true } } } } } } },
  });

  const criteria = cycle ? cycle.standardSet.standards.flatMap((s) => s.criteria) : [];
  const totalCriteria = criteria.length;
  const criterionIds = criteria.map((c) => c.id);

  const links = criterionIds.length
    ? await prisma.evidenceCriterionLink.findMany({
        where: { criterionId: { in: criterionIds }, evidence: { programId } },
        select: { criterionId: true, evidence: { select: { status: true } } },
      })
    : [];

  const coveredSet = new Set(links.map((l) => l.criterionId));
  const approvedSet = new Set(
    links.filter((l) => APPROVED_STATUSES.includes(l.evidence.status)).map((l) => l.criterionId),
  );

  const evidenceCount = await prisma.evidence.count({ where: { programId } });

  const sections = cycle
    ? await prisma.reportSection.findMany({ where: { report: { cycleId: cycle.id } }, select: { status: true } })
    : [];
  const doneSections = sections.filter((s) => s.status === ReportSectionStatus.DONE).length;
  const reportProgress = sections.length ? Math.round((doneSections / sections.length) * 100) : 0;

  const now = new Date();
  const openTasks = await prisma.task.count({ where: { programId, status: { not: TaskStatus.DONE } } });
  const overdueTasks = await prisma.task.count({
    where: { programId, status: { not: TaskStatus.DONE }, dueDate: { lt: now } },
  });

  return {
    totalCriteria,
    coveredCriteria: coveredSet.size,
    approvedCriteria: approvedSet.size,
    evidenceCount,
    readiness: totalCriteria ? Math.round((coveredSet.size / totalCriteria) * 100) : 0,
    approvedReadiness: totalCriteria ? Math.round((approvedSet.size / totalCriteria) * 100) : 0,
    reportProgress,
    openTasks,
    overdueTasks,
  };
}

/** Criteria of a program's latest cycle that have no linked evidence (risk map). */
export async function getCriteriaGaps(programId: string, limit = 8) {
  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId },
    orderBy: { year: "desc" },
    include: {
      standardSet: {
        include: {
          standards: {
            orderBy: { order: "asc" },
            include: {
              criteria: {
                orderBy: { order: "asc" },
                include: { _count: { select: { evidenceLinks: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!cycle) return [];
  const gaps = cycle.standardSet.standards
    .flatMap((s) => s.criteria)
    .filter((c) => c._count.evidenceLinks === 0)
    .map((c) => ({ code: c.code, title: c.title }));
  return gaps.slice(0, limit);
}
