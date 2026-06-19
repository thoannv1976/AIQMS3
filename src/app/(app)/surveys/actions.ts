"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { analyzeSurvey } from "@/lib/ai/features";
import { logAudit } from "@/lib/audit";
import { AiAnalysisType, QuestionType, SurveyAudience } from "@/generated/prisma/enums";

const AUDIENCE_LABEL: Record<SurveyAudience, string> = {
  STUDENT: "Sinh viên",
  ALUMNI: "Cựu sinh viên",
  LECTURER: "Giảng viên",
  EMPLOYER: "Nhà tuyển dụng",
  PARTNER: "Đối tác",
};

export async function analyzeSurveyAction(surveyId: string): Promise<{ text: string; usedFallback: boolean }> {
  const user = await requireUser();
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { questions: { include: { answers: true } } },
  });
  if (!survey) return { text: "Không tìm thấy khảo sát.", usedFallback: true };

  const openAnswers: string[] = [];
  let likertSum = 0;
  let likertCount = 0;
  for (const q of survey.questions) {
    for (const a of q.answers) {
      if (q.type === QuestionType.OPEN && a.valueText) openAnswers.push(a.valueText);
      if (q.type === QuestionType.LIKERT && a.valueNumber != null) {
        likertSum += a.valueNumber;
        likertCount++;
      }
    }
  }

  const res = await analyzeSurvey({
    title: survey.title,
    audience: AUDIENCE_LABEL[survey.audience],
    openAnswers,
    averageScore: likertCount ? likertSum / likertCount : null,
  });

  await prisma.aiAnalysisResult.create({
    data: { type: AiAnalysisType.SURVEY_ANALYSIS, targetType: "survey", targetId: surveyId, result: res.text, model: res.model, usedFallback: res.usedFallback, createdById: user.id },
  });
  await logAudit({ userId: user.id, action: "AI_SURVEY_ANALYSIS", entityType: "Survey", entityId: surveyId });
  return { text: res.text, usedFallback: res.usedFallback };
}
