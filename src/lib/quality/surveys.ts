// Advanced survey analytics (Phase 4): stakeholder comparison + multi-period
// satisfaction trends. Deterministic, built from existing Survey/Answer data.

import { prisma } from "../db";
import { QuestionType, SurveyAudience } from "@/generated/prisma/enums";

export interface AudienceStat {
  audience: SurveyAudience;
  avg: number; // mean Likert 1–5
  responses: number;
  surveys: number;
}

export interface PeriodPoint {
  period: string; // year
  avg: number;
  responses: number;
}

export interface SurveyAnalytics {
  totalSurveys: number;
  totalResponses: number;
  overallAvg: number; // 1–5
  hasLikert: boolean;
  hasMultiplePeriods: boolean;
  byAudience: AudienceStat[];
  byPeriod: PeriodPoint[];
  audiencesPresent: SurveyAudience[];
  byAudiencePeriod: Array<Record<string, string | number>>; // { period, [audience]: avg }
  lowestAudience: AudienceStat | null;
  trendDelta: number | null; // latest period avg − earliest period avg
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

function push<K>(map: Map<K, number[]>, key: K, value: number): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

export async function getSurveyAnalytics(programId: string): Promise<SurveyAnalytics> {
  const surveys = await prisma.survey.findMany({
    where: { programId },
    select: {
      audience: true,
      createdAt: true,
      questions: { select: { id: true, type: true } },
      responses: { select: { id: true, answers: { select: { questionId: true, valueNumber: true } } } },
    },
  });

  const all: number[] = [];
  const byAud = new Map<SurveyAudience, number[]>();
  const audResponses = new Map<SurveyAudience, number>();
  const audSurveys = new Map<SurveyAudience, number>();
  const byYear = new Map<string, number[]>();
  const byYearAud = new Map<string, number[]>(); // key `${year}|${aud}`
  let totalResponses = 0;

  for (const s of surveys) {
    const likertIds = new Set(s.questions.filter((q) => q.type === QuestionType.LIKERT).map((q) => q.id));
    if (likertIds.size === 0) continue;
    const year = String(s.createdAt.getFullYear());
    audSurveys.set(s.audience, (audSurveys.get(s.audience) ?? 0) + 1);

    for (const r of s.responses) {
      const vals = r.answers.filter((a) => likertIds.has(a.questionId) && a.valueNumber != null).map((a) => a.valueNumber as number);
      if (vals.length === 0) continue;
      totalResponses += 1;
      audResponses.set(s.audience, (audResponses.get(s.audience) ?? 0) + 1);
      for (const v of vals) {
        all.push(v);
        push(byAud, s.audience, v);
        push(byYear, year, v);
        push(byYearAud, `${year}|${s.audience}`, v);
      }
    }
  }

  const audiencesPresent = [...byAud.keys()];
  const byAudience: AudienceStat[] = audiencesPresent
    .map((aud) => ({
      audience: aud,
      avg: round1(mean(byAud.get(aud)!)),
      responses: audResponses.get(aud) ?? 0,
      surveys: audSurveys.get(aud) ?? 0,
    }))
    .sort((a, b) => b.avg - a.avg);

  const periods = [...byYear.keys()].sort();
  const byPeriod: PeriodPoint[] = periods.map((p) => ({
    period: p,
    avg: round1(mean(byYear.get(p)!)),
    responses: byYear.get(p)!.length,
  }));

  const byAudiencePeriod = periods.map((p) => {
    const row: Record<string, string | number> = { period: p };
    for (const aud of audiencesPresent) {
      const vals = byYearAud.get(`${p}|${aud}`);
      if (vals && vals.length) row[aud] = round1(mean(vals));
    }
    return row;
  });

  return {
    totalSurveys: surveys.length,
    totalResponses,
    overallAvg: round1(mean(all)),
    hasLikert: all.length > 0,
    hasMultiplePeriods: periods.length >= 2,
    byAudience,
    byPeriod,
    audiencesPresent,
    byAudiencePeriod,
    lowestAudience: byAudience.length ? byAudience[byAudience.length - 1] : null,
    trendDelta: byPeriod.length >= 2 ? round1(byPeriod[byPeriod.length - 1].avg - byPeriod[0].avg) : null,
  };
}
