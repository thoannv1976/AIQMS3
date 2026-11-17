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

/**
 * Chronological order for period labels such as "HK2 2023–2024", "2025-1", "K2022" or
 * "K1 (TN 2025)": first 4-digit year, then the semester number (HK1/HK2/HK3 or "-1"/"-2").
 * Plain string order would put "HK1 2025–2026" before "HK2 2023–2024".
 */
export function periodSortKey(label: string): number {
  const year = Number(/(19|20)\d{2}/.exec(label)?.[0] ?? 9999);
  const term = Number(/HK\s*(\d)/i.exec(label)?.[1] ?? /\d{4}\s*[-–/]\s*(\d)\b/.exec(label)?.[1] ?? 0);
  return year * 10 + term;
}
export const comparePeriods = (a: string, b: string) => periodSortKey(a) - periodSortKey(b) || a.localeCompare(b, "vi");

export async function getObeTrends(programId: string): Promise<ObeTrends> {
  const all = await prisma.outcomeAssessment.findMany({
    where: { programId },
    select: { ploCode: true, semester: true, cohort: true, achievedRate: true, threshold: true },
  });
  // Measurement periods (semesters) and graduating cohorts are different time axes; when both
  // exist, trend over semesters and keep cohort results for the detail table only.
  const rows = all.some((r) => r.semester) ? all.filter((r) => r.semester) : all;

  const periodOf = (r: (typeof rows)[number]) => r.semester || r.cohort || "—";
  const periods = [...new Set(rows.map(periodOf))].sort(comparePeriods);
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
