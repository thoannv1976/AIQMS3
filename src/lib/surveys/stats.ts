// Per-question summary of survey answers, shared by the AI survey analysis.
import { QuestionType } from "@/generated/prisma/enums";

type Question = { text: string; type: QuestionType; answers: Array<{ valueNumber: number | null; valueText: string | null }> };

export interface LikertSummary { text: string; n: number; avg: number; dist: number[]; agreePct: number }
export interface ChoiceSummary { text: string; n: number; top: Array<[string, number]> }

export function summarizeSurveyQuestions(questions: Question[]) {
  const likert: LikertSummary[] = [];
  const choices: ChoiceSummary[] = [];
  const openAnswers: string[] = [];
  for (const q of questions) {
    if (q.type === QuestionType.LIKERT) {
      const nums = q.answers.map((a) => a.valueNumber).filter((n): n is number => n != null);
      if (!nums.length) continue;
      const dist = [1, 2, 3, 4, 5].map((v) => nums.filter((n) => Math.round(n) === v).length);
      likert.push({
        text: q.text,
        n: nums.length,
        avg: nums.reduce((s, n) => s + n, 0) / nums.length,
        dist,
        agreePct: Math.round(((dist[3] + dist[4]) / nums.length) * 1000) / 10,
      });
    } else if (q.type === QuestionType.OPEN) {
      for (const a of q.answers) if (a.valueText?.trim()) openAnswers.push(a.valueText.trim());
    } else {
      const counts = new Map<string, number>();
      for (const a of q.answers)
        for (const x of (a.valueText ?? "").split(";").map((s) => s.trim()).filter(Boolean)) counts.set(x, (counts.get(x) ?? 0) + 1);
      if (counts.size) choices.push({ text: q.text, n: q.answers.length, top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) });
    }
  }
  const total = likert.reduce((s, l) => s + l.n, 0);
  const averageScore = total ? likert.reduce((s, l) => s + l.avg * l.n, 0) / total : null;
  return { likert, choices, openAnswers, averageScore };
}
