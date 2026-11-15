// Criteria × evidence matrix for a program's current accreditation cycle.
import { prisma } from "../db";
import { APPROVED_LIKE, validityState } from "../access";
import type { Prisma } from "@/generated/prisma/client";
import type { EvidenceStatus } from "@/generated/prisma/enums";

/** Condition criteria ("tiêu chí điều kiện") of TT04/2025 (Điều 13). */
export const TT04_CONDITION_CRITERIA = new Set(["1.3", "1.6", "2.2", "2.4", "3.2", "4.5", "5.2", "6.1", "7.3", "8.2"]);

export interface MatrixEvidence {
  id: string;
  code: string;
  title: string;
  status: EvidenceStatus;
  state: "approved" | "pending" | "expired";
}
export interface MatrixRow {
  criterionId: string;
  code: string;
  title: string;
  condition: boolean;
  evidence: MatrixEvidence[];
}
export interface MatrixStandard {
  code: string;
  title: string;
  rows: MatrixRow[];
}

export async function buildEvidenceMatrix(programId: string, visibility: Prisma.EvidenceWhereInput) {
  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    include: {
      standardSet: {
        include: { standards: { orderBy: { order: "asc" }, include: { criteria: { orderBy: { order: "asc" } } } } },
      },
    },
  });
  if (!cycle) return null;
  const isTT04 = cycle.standardSet.code === "MOET_TT04_2025";
  const criteriaIds = cycle.standardSet.standards.flatMap((s) => s.criteria.map((c) => c.id));
  const links = await prisma.evidenceCriterionLink.findMany({
    where: { criterionId: { in: criteriaIds }, evidence: visibility },
    select: {
      criterionId: true,
      evidence: { select: { id: true, code: true, title: true, status: true, validUntil: true } },
    },
    orderBy: { evidence: { code: "asc" } },
  });
  const byCrit = new Map<string, MatrixEvidence[]>();
  for (const l of links) {
    const e = l.evidence;
    const state: MatrixEvidence["state"] =
      validityState(e.validUntil) === "expired" ? "expired" : APPROVED_LIKE.includes(e.status) ? "approved" : "pending";
    const arr = byCrit.get(l.criterionId) ?? [];
    arr.push({ id: e.id, code: e.code, title: e.title, status: e.status, state });
    byCrit.set(l.criterionId, arr);
  }
  const standards: MatrixStandard[] = cycle.standardSet.standards.map((s) => ({
    code: s.code,
    title: s.title,
    rows: s.criteria.map((c) => ({
      criterionId: c.id,
      code: c.code,
      title: c.title,
      condition: isTT04 && TT04_CONDITION_CRITERIA.has(c.code),
      evidence: byCrit.get(c.id) ?? [],
    })),
  }));
  const rows = standards.flatMap((s) => s.rows);
  const summary = {
    criteria: rows.length,
    withEvidence: rows.filter((r) => r.evidence.length > 0).length,
    withApproved: rows.filter((r) => r.evidence.some((e) => e.state === "approved")).length,
    conditionMissing: rows.filter((r) => r.condition && !r.evidence.some((e) => e.state === "approved")).map((r) => r.code),
  };
  return { cycle, standards, summary };
}
