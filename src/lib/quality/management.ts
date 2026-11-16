// Management overview for the quality dashboard (QA12): program/faculty aggregates,
// evidence validity, PDCA progress, recent activity. Shared by the dashboard,
// the AI leadership brief and the management-report export.
import { prisma } from "../db";
import { getProgramStats, type ProgramStats } from "../metrics";
import { buildEvidenceMatrix } from "../evidence/matrix";
import { evidenceStatus } from "../labels";
import { EvidenceStatus, PdcaStatus, TaskStatus } from "@/generated/prisma/enums";

export interface ProgramRow {
  id: string;
  code: string;
  name: string;
  facultyId: string;
  facultyName: string;
  standardSet: string | null;
  stats: ProgramStats;
  conditionMissing: string[];
}
export interface FacultyRow {
  id: string;
  name: string;
  programs: number;
  avgReadiness: number;
  pendingEvidence: number;
  overdueTasks: number;
}
export interface ManagementOverview {
  scopeLabel: string;
  programs: ProgramRow[];
  faculties: FacultyRow[];
  evidenceByStatus: Array<{ status: EvidenceStatus; label: string; count: number }>;
  totalEvidence: number;
  expired: number;
  expiring: number;
  overdueTasks: number;
  openCycles: number;
  pdca: { total: number; completed: number; inProgress: number };
  last30: { evidenceUploaded: number; evidenceApproved: number; sectionsSaved: number };
  avgReadiness: number;
}

export async function getManagementOverview(opts: { programIds: string[] | null; facultyId?: string | null }): Promise<ManagementOverview> {
  const where = {
    ...(opts.programIds ? { id: { in: opts.programIds } } : {}),
    ...(opts.facultyId ? { facultyId: opts.facultyId } : {}),
  };
  const programs = await prisma.program.findMany({
    where,
    include: { faculty: true, cycles: { orderBy: [{ year: "desc" }, { createdAt: "desc" }], take: 1, include: { standardSet: true } } },
    orderBy: { createdAt: "asc" },
  });
  const ids = programs.map((p) => p.id);
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() + 60 * 86400000);

  const rows: ProgramRow[] = await Promise.all(
    programs.map(async (p) => {
      const matrix = await buildEvidenceMatrix(p.id, { programId: p.id });
      return {
        id: p.id,
        code: p.code,
        name: p.nameVi,
        facultyId: p.facultyId,
        facultyName: p.faculty.name,
        standardSet: p.cycles[0]?.standardSet.name.split("—")[0].trim() ?? null,
        stats: await getProgramStats(p.id),
        conditionMissing: matrix?.summary.conditionMissing ?? [],
      };
    }),
  );

  const [groups, expired, expiring, overdueTasks, openCycles, pdcaRows, upl, appr, saved] = await Promise.all([
    prisma.evidence.groupBy({ by: ["status"], where: { programId: { in: ids } }, _count: { _all: true } }),
    prisma.evidence.count({ where: { programId: { in: ids }, validUntil: { lt: now } } }),
    prisma.evidence.count({ where: { programId: { in: ids }, validUntil: { gte: now, lte: d60 } } }),
    prisma.task.count({ where: { programId: { in: ids }, status: { not: TaskStatus.DONE }, dueDate: { lt: now } } }),
    prisma.accreditationCycle.count({ where: { programId: { in: ids }, status: { notIn: ["CLOSED"] } } }),
    prisma.improvementPlan.groupBy({ by: ["status"], where: { programId: { in: ids } }, _count: { _all: true } }),
    prisma.evidence.count({ where: { programId: { in: ids }, createdAt: { gte: d30 } } }),
    prisma.evidence.count({ where: { programId: { in: ids }, approvedAt: { gte: d30 } } }),
    prisma.reportSectionRevision.count({ where: { createdAt: { gte: d30 }, section: { report: { cycle: { programId: { in: ids } } } } } }),
  ]);

  const facMap = new Map<string, FacultyRow>();
  for (const r of rows) {
    const f = facMap.get(r.facultyId) ?? { id: r.facultyId, name: r.facultyName, programs: 0, avgReadiness: 0, pendingEvidence: 0, overdueTasks: 0 };
    f.programs += 1;
    f.avgReadiness += r.stats.readiness;
    f.overdueTasks += r.stats.overdueTasks;
    facMap.set(r.facultyId, f);
  }
  const pendingByProgram = await prisma.evidence.groupBy({
    by: ["programId"],
    where: { programId: { in: ids }, status: { in: [EvidenceStatus.UPLOADED, EvidenceStatus.SUBMITTED, EvidenceStatus.REVIEWED, EvidenceStatus.NEEDS_REVISION] } },
    _count: { _all: true },
  });
  for (const pg of pendingByProgram) {
    const r = rows.find((x) => x.id === pg.programId);
    if (r) facMap.get(r.facultyId)!.pendingEvidence += pg._count._all;
  }
  const faculties = [...facMap.values()].map((f) => ({ ...f, avgReadiness: f.programs ? Math.round(f.avgReadiness / f.programs) : 0 }));

  const pdcaTotal = pdcaRows.reduce((s, r) => s + r._count._all, 0);
  const pdcaDone = pdcaRows.find((r) => r.status === PdcaStatus.COMPLETED)?._count._all ?? 0;
  const faculty = opts.facultyId ? programs[0]?.faculty.name ?? "Khoa" : opts.programIds ? "Chương trình được phân công" : "Toàn trường";

  return {
    scopeLabel: faculty,
    programs: rows,
    faculties,
    evidenceByStatus: groups.map((g) => ({ status: g.status, label: evidenceStatus[g.status].label, count: g._count._all })),
    totalEvidence: groups.reduce((s, g) => s + g._count._all, 0),
    expired,
    expiring,
    overdueTasks,
    openCycles,
    pdca: { total: pdcaTotal, completed: pdcaDone, inProgress: pdcaTotal - pdcaDone },
    last30: { evidenceUploaded: upl, evidenceApproved: appr, sectionsSaved: saved },
    avgReadiness: rows.length ? Math.round(rows.reduce((s, r) => s + r.stats.readiness, 0) / rows.length) : 0,
  };
}

/** Plain-text digest of the overview, used as the AI prompt and in exports. */
export function overviewToText(o: ManagementOverview): string {
  const lines = [
    `Phạm vi: ${o.scopeLabel}. ${o.programs.length} chương trình, ${o.openCycles} chu kỳ kiểm định đang mở.`,
    `Mức sẵn sàng trung bình (tỷ lệ tiêu chí có minh chứng): ${o.avgReadiness}%.`,
    `Minh chứng: ${o.totalEvidence} (${o.evidenceByStatus.map((e) => `${e.label} ${e.count}`).join(", ")}); hết hiệu lực ${o.expired}, sắp hết hạn ${o.expiring}.`,
    `Nhiệm vụ quá hạn: ${o.overdueTasks}. Kế hoạch cải tiến PDCA: ${o.pdca.completed}/${o.pdca.total} hoàn thành.`,
    `30 ngày qua: tải lên ${o.last30.evidenceUploaded} minh chứng, duyệt ${o.last30.evidenceApproved}, ${o.last30.sectionsSaved} lần cập nhật mục SAR.`,
    "Theo chương trình:",
    ...o.programs.map(
      (p) =>
        `- ${p.code} (${p.facultyName}; ${p.standardSet ?? "chưa có chu kỳ"}): sẵn sàng ${p.stats.readiness}%, tiêu chí có MC ${p.stats.coveredCriteria}/${p.stats.totalCriteria}, MC đã duyệt ${p.stats.approvedCriteria} tiêu chí, SAR ${p.stats.reportProgress}%, quá hạn ${p.stats.overdueTasks}` +
        (p.conditionMissing.length ? `; tiêu chí điều kiện chưa có MC duyệt: ${p.conditionMissing.join(", ")}` : ""),
    ),
  ];
  if (o.faculties.length > 1) {
    lines.push("Theo khoa:", ...o.faculties.map((f) => `- ${f.name}: ${f.programs} CTĐT, sẵn sàng TB ${f.avgReadiness}%, MC chờ duyệt ${f.pendingEvidence}, việc quá hạn ${f.overdueTasks}`));
  }
  return lines.join("\n");
}

/** Cache key for the AI leadership brief: shared for institution-wide viewers, per-user for program-scoped ones. */
export function briefTargetId(scope: string[] | null, userId: string, facultyId: string | null): string {
  const f = facultyId ?? "all";
  return scope === null ? f : `u:${userId}:${f}`;
}
