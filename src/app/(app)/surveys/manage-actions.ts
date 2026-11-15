"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { programRolesOf } from "@/lib/program-context";
import { logAudit } from "@/lib/audit";
import { parseDate } from "@/lib/evidence/upload";
import { SURVEY_TEMPLATES } from "@/lib/surveys/templates";
import { QuestionType, SurveyAudience, SurveyStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function canWriteProgram(programId: string) {
  const user = await requireUser();
  return canInProgram(user.role, await programRolesOf(user.id, programId), "survey:write") ? user : null;
}
async function surveyWriter(surveyId: string) {
  const s = await prisma.survey.findUnique({ where: { id: surveyId }, select: { id: true, programId: true, status: true, publicToken: true } });
  if (!s) return null;
  const user = await canWriteProgram(s.programId);
  return user ? { user, survey: s } : null;
}

export async function createSurveyAction(formData: FormData): Promise<void> {
  const programId = str(formData, "programId");
  const user = await canWriteProgram(programId);
  if (!user) return;
  const tpl = SURVEY_TEMPLATES.find((t) => t.key === str(formData, "template"));
  const audience = (str(formData, "audience") || tpl?.audience || "STUDENT") as SurveyAudience;
  const survey = await prisma.survey.create({
    data: {
      programId,
      title: str(formData, "title") || tpl?.title || "Phiếu khảo sát",
      audience: Object.values(SurveyAudience).includes(audience) ? audience : SurveyAudience.STUDENT,
      description: str(formData, "description") || tpl?.description || null,
      criterionId: str(formData, "criterionId") || null,
      opensAt: parseDate(formData.get("opensAt")),
      closesAt: parseDate(formData.get("closesAt")),
      status: SurveyStatus.DRAFT,
      questions: tpl
        ? {
            create: tpl.questions.map((q, i) => ({
              text: q.text,
              type: q.type,
              order: i,
              options: (q.options ?? undefined) as Prisma.InputJsonValue | undefined,
            })),
          }
        : undefined,
    },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Survey", entityId: survey.id, detail: { template: tpl?.key ?? null } });
  revalidatePath("/surveys");
  redirect(`/surveys/${survey.id}`);
}

export async function addQuestionAction(surveyId: string, formData: FormData): Promise<void> {
  const ctx = await surveyWriter(surveyId);
  if (!ctx) return;
  const text = str(formData, "text");
  const type = str(formData, "type") as QuestionType;
  if (!text || !Object.values(QuestionType).includes(type)) return;
  const options = str(formData, "options")
    .split(/\n|;/)
    .map((o) => o.trim())
    .filter(Boolean);
  const count = await prisma.surveyQuestion.count({ where: { surveyId } });
  await prisma.surveyQuestion.create({
    data: {
      surveyId,
      text,
      type,
      order: count,
      options: type === QuestionType.SINGLE_CHOICE || type === QuestionType.MULTI_CHOICE ? (options as Prisma.InputJsonValue) : undefined,
    },
  });
  revalidatePath(`/surveys/${surveyId}`);
}

export async function deleteQuestionAction(surveyId: string, questionId: string): Promise<void> {
  const ctx = await surveyWriter(surveyId);
  if (!ctx) return;
  await prisma.surveyQuestion.deleteMany({ where: { id: questionId, surveyId } });
  revalidatePath(`/surveys/${surveyId}`);
}

/** Open (publishes a public link) / close / reopen a survey. */
export async function setSurveyStatusAction(surveyId: string, status: SurveyStatus): Promise<void> {
  const ctx = await surveyWriter(surveyId);
  if (!ctx) return;
  await prisma.survey.update({
    where: { id: surveyId },
    data: {
      status,
      publicToken: status === SurveyStatus.OPEN && !ctx.survey.publicToken ? crypto.randomBytes(12).toString("base64url") : undefined,
    },
  });
  await logAudit({ userId: ctx.user.id, action: "UPDATE_STATUS", entityType: "Survey", entityId: surveyId, detail: { status } });
  revalidatePath(`/surveys/${surveyId}`);
  revalidatePath("/surveys");
}

export async function updateSurveyScheduleAction(surveyId: string, formData: FormData): Promise<void> {
  const ctx = await surveyWriter(surveyId);
  if (!ctx) return;
  await prisma.survey.update({
    where: { id: surveyId },
    data: { opensAt: parseDate(formData.get("opensAt")), closesAt: parseDate(formData.get("closesAt")), criterionId: str(formData, "criterionId") || null },
  });
  revalidatePath(`/surveys/${surveyId}`);
}
