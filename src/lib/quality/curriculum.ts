// Curriculum coherence checker (Phase 4): verifies the PLO → CLO → Assessment →
// Rubric chain for a program. Deterministic; the result also feeds an AI narrative.

import { prisma } from "../db";
import { ContributionLevel, SyllabusStatus } from "@/generated/prisma/enums";

export type IssueSeverity = "high" | "medium" | "low";

export interface CurriculumIssue {
  type: string;
  severity: IssueSeverity;
  message: string;
}

export interface CurriculumReport {
  ploCount: number;
  cloCount: number;
  courseCount: number;
  coverage: {
    ploSupported: number; // % PLOs supported by ≥1 course in the curriculum map
    ploMastered: number; // % PLOs reaching a Mastered level
    ploLinkedToClo: number; // % PLOs linked from ≥1 CLO
    coursesWithClo: number; // % courses that declare CLOs
    coursesWithAssessment: number; // % courses whose syllabus defines assessment methods
    coursesWithRubric: number; // % courses with at least one rubric
  };
  issues: CurriculumIssue[];
}

function pctRound(n: number, total: number): number {
  return total ? Math.round((n / total) * 100) : 0;
}

export async function getCurriculumReport(programId: string): Promise<CurriculumReport> {
  const [plos, courses, maps, cloPloLinks] = await Promise.all([
    prisma.plo.findMany({ where: { programId }, orderBy: { code: "asc" }, select: { id: true, code: true } }),
    prisma.course.findMany({
      where: { programId },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        clos: { select: { id: true } },
        rubrics: { select: { id: true } },
        syllabi: { orderBy: { createdAt: "desc" }, take: 1, select: { assessmentMethods: true, status: true } },
      },
    }),
    prisma.curriculumMap.findMany({ where: { programId }, select: { ploId: true, level: true } }),
    prisma.cloPloLink.findMany({
      where: { plo: { programId } },
      select: { ploId: true, clo: { select: { courseId: true } } },
    }),
  ]);

  const issues: CurriculumIssue[] = [];

  // --- PLO coverage via curriculum map ---
  const supportedPlo = new Set(maps.map((m) => m.ploId));
  const masteredPlo = new Set(maps.filter((m) => m.level === ContributionLevel.MASTERED).map((m) => m.ploId));
  const ploLinkedClo = new Set(cloPloLinks.map((l) => l.ploId));

  for (const p of plos) {
    if (!supportedPlo.has(p.id))
      issues.push({ type: "plo_unsupported", severity: "high", message: `${p.code}: chưa có học phần nào trong ma trận đóng góp cho PLO này.` });
    else if (!masteredPlo.has(p.id))
      issues.push({ type: "plo_no_mastered", severity: "medium", message: `${p.code}: chưa có học phần ở mức Mastered (thành thạo).` });

    if (!ploLinkedClo.has(p.id))
      issues.push({ type: "plo_no_clo", severity: "high", message: `${p.code}: chưa có CLO nào của học phần liên kết tới PLO này.` });
  }

  // --- Course-level checks: CLOs, assessment, rubric ---
  let coursesWithClo = 0;
  let coursesWithAssessment = 0;
  let coursesWithRubric = 0;
  for (const c of courses) {
    if (c.clos.length > 0) coursesWithClo += 1;
    else issues.push({ type: "course_no_clo", severity: "medium", message: `${c.code}: học phần chưa khai báo CLO.` });

    const syllabus = c.syllabi[0];
    const hasAssessment = Boolean(syllabus?.assessmentMethods && syllabus.assessmentMethods.trim().length > 0);
    if (hasAssessment) coursesWithAssessment += 1;
    else issues.push({ type: "course_no_assessment", severity: "medium", message: `${c.code}: đề cương chưa mô tả phương pháp đánh giá (assessment).` });

    if (c.rubrics.length > 0) coursesWithRubric += 1;
    else issues.push({ type: "course_no_rubric", severity: "low", message: `${c.code}: chưa có rubric chấm điểm gắn với học phần.` });

    if (syllabus && syllabus.status === SyllabusStatus.DRAFT)
      issues.push({ type: "syllabus_draft", severity: "low", message: `${c.code}: đề cương còn ở trạng thái nháp, chưa được duyệt.` });
  }

  // --- CLOs that link to no PLO (orphan CLOs) ---
  const courseIdsWithClo = new Set(courses.filter((c) => c.clos.length > 0).map((c) => c.id));
  const courseIdsCloLinked = new Set(cloPloLinks.map((l) => l.clo.courseId));
  for (const c of courses) {
    if (courseIdsWithClo.has(c.id) && !courseIdsCloLinked.has(c.id))
      issues.push({ type: "clo_orphan", severity: "medium", message: `${c.code}: có CLO nhưng chưa liên kết CLO → PLO nào.` });
  }

  const cloCount = courses.reduce((s, c) => s + c.clos.length, 0);

  const severityOrder: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    ploCount: plos.length,
    cloCount,
    courseCount: courses.length,
    coverage: {
      ploSupported: pctRound(supportedPlo.size, plos.length),
      ploMastered: pctRound(masteredPlo.size, plos.length),
      ploLinkedToClo: pctRound(ploLinkedClo.size, plos.length),
      coursesWithClo: pctRound(coursesWithClo, courses.length),
      coursesWithAssessment: pctRound(coursesWithAssessment, courses.length),
      coursesWithRubric: pctRound(coursesWithRubric, courses.length),
    },
    issues,
  };
}
