// Cross-program benchmarking (Phase 5): compares accreditation readiness, OBE and
// evidence strength across all programs. Reuses the per-program readiness engine.

import { prisma } from "../db";
import { getReadinessReport } from "./scoring";

export interface ProgramBenchmark {
  programId: string;
  code: string;
  nameVi: string;
  readiness: number;
  aunPoint: number;
  criteriaTotal: number;
  criteriaWithEvidence: number;
  sarDonePct: number;
  evidenceCount: number;
  evidenceStrengthAvg: number;
  obeAvg: number | null;
}

export async function getBenchmark(): Promise<ProgramBenchmark[]> {
  const programs = await prisma.program.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, nameVi: true },
  });

  const out: ProgramBenchmark[] = [];
  for (const p of programs) {
    const [report, obe, evidenceCount] = await Promise.all([
      getReadinessReport(p.id),
      prisma.outcomeAssessment.aggregate({ where: { programId: p.id }, _avg: { achievedRate: true } }),
      prisma.evidence.count({ where: { programId: p.id } }),
    ]);

    let strengthSum = 0;
    let strengthN = 0;
    if (report) {
      for (const std of report.standards) {
        for (const c of std.criteria) {
          for (const e of c.evidence) {
            strengthSum += e.score;
            strengthN += 1;
          }
        }
      }
    }

    out.push({
      programId: p.id,
      code: p.code,
      nameVi: p.nameVi,
      readiness: report?.overall ?? 0,
      aunPoint: report?.aun.point ?? 0,
      criteriaTotal: report?.totals.criteria ?? 0,
      criteriaWithEvidence: report?.totals.withEvidence ?? 0,
      sarDonePct: report && report.totals.criteria ? Math.round((report.totals.sarDone / report.totals.criteria) * 100) : 0,
      evidenceCount,
      evidenceStrengthAvg: strengthN ? Math.round(strengthSum / strengthN) : 0,
      obeAvg: obe._avg.achievedRate != null ? Math.round(obe._avg.achievedRate) : null,
    });
  }

  return out.sort((a, b) => b.readiness - a.readiness);
}
