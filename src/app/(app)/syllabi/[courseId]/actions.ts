"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { reviewSyllabus } from "@/lib/ai/features";
import { assessSyllabus } from "@/lib/quality/syllabus";
import { AiAnalysisType } from "@/generated/prisma/enums";

export interface SyllabusCheckDto {
  label: string;
  passed: boolean;
}
export interface SyllabusReviewResult {
  text: string;
  usedFallback: boolean;
  report: { score: number; band: string; checks: SyllabusCheckDto[]; issues: string[] };
}

export async function reviewSyllabusAction(courseId: string): Promise<SyllabusReviewResult> {
  const user = await requireUser();
  const empty: SyllabusReviewResult = {
    text: "Không tìm thấy học phần.",
    usedFallback: true,
    report: { score: 0, band: "missing", checks: [], issues: [] },
  };

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      clos: { orderBy: { code: "asc" } },
      syllabi: { orderBy: { createdAt: "desc" }, take: 1 },
      curriculumMaps: { include: { plo: true } },
    },
  });
  if (!course) return empty;

  const cloIds = course.clos.map((c) => c.id);
  const cloPloLinkCount = cloIds.length ? await prisma.cloPloLink.count({ where: { cloId: { in: cloIds } } }) : 0;
  const syl = course.syllabi[0];

  const report = assessSyllabus({
    objectives: syl?.objectives,
    content: syl?.content,
    teachingMethods: syl?.teachingMethods,
    assessmentMethods: syl?.assessmentMethods,
    materials: syl?.materials,
    schedule: syl?.schedule,
    cloCount: course.clos.length,
    ploMapCount: course.curriculumMaps.length,
    cloPloLinkCount,
  });

  const res = await reviewSyllabus(
    {
      courseCode: course.code,
      courseName: course.nameVi,
      objectives: syl?.objectives,
      content: syl?.content,
      teachingMethods: syl?.teachingMethods,
      assessmentMethods: syl?.assessmentMethods,
      clos: course.clos.map((c) => `${c.code}: ${c.description}`),
      ploLinks: course.curriculumMaps.map((m) => m.plo.code),
      completeness: report.score,
      issues: report.issues,
    },
    { userId: user.id },
  );

  await prisma.aiAnalysisResult.create({
    data: {
      type: AiAnalysisType.SYLLABUS_REVIEW,
      targetType: "course",
      targetId: courseId,
      result: res.text,
      data: { completeness: report.score, band: report.band },
      model: res.model,
      usedFallback: res.usedFallback,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "AI_SYLLABUS_REVIEW",
    entityType: "Course",
    entityId: courseId,
    detail: { completeness: report.score },
  });

  return {
    text: res.text,
    usedFallback: res.usedFallback,
    report: {
      score: report.score,
      band: report.band,
      checks: report.checks.map((c) => ({ label: c.label, passed: c.passed })),
      issues: report.issues,
    },
  };
}
