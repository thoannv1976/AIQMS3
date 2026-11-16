"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { QuestionType, SurveyStatus } from "@/generated/prisma/enums";

export interface PublicSurveyState {
  error?: string;
  done?: boolean;
}

/** Public (no login) survey submission. One response per browser via a cookie key. */
export async function submitSurveyAction(token: string, _prev: PublicSurveyState, formData: FormData): Promise<PublicSurveyState> {
  const survey = await prisma.survey.findUnique({ where: { publicToken: token }, include: { questions: true } });
  if (!survey) return { error: "Phiếu khảo sát không tồn tại." };
  const now = new Date();
  if (survey.status !== SurveyStatus.OPEN || (survey.opensAt && survey.opensAt > now) || (survey.closesAt && survey.closesAt < now)) {
    return { error: "Phiếu khảo sát hiện không nhận phản hồi." };
  }

  const store = await cookies();
  const cookieName = `aiqms_sv_${survey.id}`;
  let clientKey = store.get(cookieName)?.value;
  if (clientKey && (await prisma.surveyResponse.findFirst({ where: { surveyId: survey.id, clientKey } }))) {
    return { error: "Bạn đã gửi phản hồi cho phiếu này. Cảm ơn bạn!" };
  }
  clientKey = clientKey ?? crypto.randomBytes(16).toString("hex");

  const answers: Array<{ questionId: string; valueNumber?: number; valueText?: string }> = [];
  for (const q of survey.questions) {
    const key = `q_${q.id}`;
    if (q.type === QuestionType.LIKERT) {
      const v = Number(formData.get(key));
      if (v >= 1 && v <= 5) answers.push({ questionId: q.id, valueNumber: v });
    } else if (q.type === QuestionType.MULTI_CHOICE) {
      const vals = formData.getAll(key).map(String).filter(Boolean);
      if (vals.length) answers.push({ questionId: q.id, valueText: vals.join("; ") });
    } else {
      const v = String(formData.get(key) ?? "").trim().slice(0, 2000);
      if (v) answers.push({ questionId: q.id, valueText: v });
    }
  }
  if (answers.length === 0) return { error: "Vui lòng trả lời ít nhất một câu hỏi." };

  await prisma.surveyResponse.create({
    data: {
      surveyId: survey.id,
      clientKey,
      respondent: "Ẩn danh",
      answers: { create: answers.map((a) => ({ questionId: a.questionId, valueNumber: a.valueNumber ?? null, valueText: a.valueText ?? null })) },
    },
  });
  store.set(cookieName, clientKey, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return { done: true };
}
