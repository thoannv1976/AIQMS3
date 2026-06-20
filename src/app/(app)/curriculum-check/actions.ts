"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { reviewCurriculumLogic } from "@/lib/ai/features";
import { getCurriculumReport } from "@/lib/quality/curriculum";
import { AiAnalysisType } from "@/generated/prisma/enums";

export async function curriculumReviewAction(programId: string): Promise<{ text: string; usedFallback: boolean }> {
  const user = await requireUser();
  if (!programId) return { text: "Vui lòng chọn chương trình.", usedFallback: true };

  const report = await getCurriculumReport(programId);

  const res = await reviewCurriculumLogic(
    {
      ploCount: report.ploCount,
      cloCount: report.cloCount,
      courseCount: report.courseCount,
      coverage: report.coverage,
      issues: report.issues.map((i) => ({ severity: i.severity, message: i.message })),
    },
    { userId: user.id },
  );

  await prisma.aiAnalysisResult.create({
    data: {
      type: AiAnalysisType.MATRIX_CHECK,
      targetType: "program",
      targetId: programId,
      result: res.text,
      model: res.model,
      usedFallback: res.usedFallback,
      createdById: user.id,
    },
  });
  await logAudit({ userId: user.id, action: "AI_CURRICULUM_CHECK", entityType: "Program", entityId: programId });

  return { text: res.text, usedFallback: res.usedFallback };
}
