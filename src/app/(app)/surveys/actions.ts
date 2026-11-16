"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { analyzeSurvey } from "@/lib/ai/features";
import { logAudit } from "@/lib/audit";
import { AiAnalysisType, SurveyAudience } from "@/generated/prisma/enums";
import { summarizeSurveyQuestions } from "@/lib/surveys/stats";

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
    include: {
      questions: { orderBy: { order: "asc" }, include: { answers: true } },
      criterion: { select: { code: true } },
      _count: { select: { responses: true } },
    },
  });
  if (!survey) return { text: "Không tìm thấy khảo sát.", usedFallback: true };

  const res = await analyzeSurvey({
    title: survey.title,
    audience: AUDIENCE_LABEL[survey.audience],
    responses: survey._count.responses,
    criterionCode: survey.criterion?.code ?? null,
    ...summarizeSurveyQuestions(survey.questions),
  }, { userId: user.id });

  await prisma.aiAnalysisResult.create({
    data: { type: AiAnalysisType.SURVEY_ANALYSIS, targetType: "survey", targetId: surveyId, result: res.text, model: res.model, usedFallback: res.usedFallback, createdById: user.id },
  });
  await logAudit({ userId: user.id, action: "AI_SURVEY_ANALYSIS", entityType: "Survey", entityId: surveyId });
  return { text: res.text, usedFallback: res.usedFallback };
}
