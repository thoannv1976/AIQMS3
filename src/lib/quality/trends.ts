// Multi-period (cohort/semester) trend analysis for outcome achievement (OBE).
// Deterministic; no schema change — built from existing OutcomeAssessment rows.

import { prisma } from "../db";

export type TrendDirection = "up" | "down" | "flat" | "na";

export interface PeriodSummary {
  period: string;
  avgRate: number;
  count: number;
  belowCount: number;
}

export interface PloTrend {
  ploCode: string;
  byPeriod: Record<string, number>; // period -> rate
  latest: number | null;
  delta: number | null; // latest - previous period
  direction: TrendDirection;
}

export interface ObeTrends {
  periods: string[];
  periodSummary: PeriodSummary[];
  ploTrends: PloTrend[];
  threshold: number;
  hasMultiplePeriods: boolean;
  improving: string[];
  declining: string[];
}

const DELTA_FLAT = 2; // within ±2pp counts as flat

function directionOf(delta: number | null): TrendDirection {
  if (delta === null) return "na";
  if (delta > DELTA_FLAT) return "up";
  if (delta < -DELTA_FLAT) return "down";
  return "flat";
}

export async function getObeTrends(programId: string): Promise<ObeTrends> {
  const rows = await prisma.outcomeAssessment.findMany({
    where: { programId },
    select: { ploCode: true, semester: true, cohort: true, achievedRate: true, threshold: true },
  });

  const periodOf = (r: (typeof rows)[number]) => r.semester || r.cohort || "—";
  const periods = [...new Set(rows.map(periodOf))].sort((a, b) => a.localeCompare(b, "vi"));
  const threshold = rows.length ? Math.round(rows[0].threshold) : 70;

  const periodSummary: PeriodSummary[] = periods.map((p) => {
    const inPeriod = rows.filter((r) => periodOf(r) === p);
    const avgRate = inPeriod.length
      ? Math.round(inPeriod.reduce((s, r) => s + r.achievedRate, 0) / inPeriod.length)
      : 0;
    const belowCount = inPeriod.filter((r) => r.achievedRate < r.threshold).length;
    return { period: p, avgRate, count: inPeriod.length, belowCount };
  });

  // Group by PLO across periods (average if multiple rows share a period).
  const ploCodes = [...new Set(rows.map((r) => r.ploCode).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, "vi"),
  );

  const ploTrends: PloTrend[] = ploCodes.map((code) => {
    const byPeriod: Record<string, number> = {};
    for (const p of periods) {
      const cells = rows.filter((r) => r.ploCode === code && periodOf(r) === p);
      if (cells.length) byPeriod[p] = Math.round(cells.reduce((s, r) => s + r.achievedRate, 0) / cells.length);
    }
    const present = periods.filter((p) => p in byPeriod);
    const latest = present.length ? byPeriod[present[present.length - 1]] : null;
    const prev = present.length >= 2 ? byPeriod[present[present.length - 2]] : null;
    const delta = latest !== null && prev !== null ? latest - prev : null;
    return { ploCode: code, byPeriod, latest, delta, direction: directionOf(delta) };
  });

  return {
    periods,
    periodSummary,
    ploTrends,
    threshold,
    hasMultiplePeriods: periods.length >= 2,
    improving: ploTrends.filter((t) => t.direction === "up").map((t) => t.ploCode),
    declining: ploTrends.filter((t) => t.direction === "down").map((t) => t.ploCode),
  };
}
