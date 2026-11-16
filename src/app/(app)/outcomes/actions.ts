"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { aiComplete } from "@/lib/ai/client";
import { logAudit } from "@/lib/audit";
import { AiAnalysisType, ContributionLevel } from "@/generated/prisma/enums";

export async function analyzeMatrixAction(
  programId: string,
): Promise<{ text: string; usedFallback: boolean; issues: string[] }> {
  const user = await requireUser();

  const [plos, courses, maps] = await Promise.all([
    prisma.plo.findMany({ where: { programId }, orderBy: { code: "asc" } }),
    prisma.course.findMany({ where: { programId }, orderBy: { code: "asc" } }),
    prisma.curriculumMap.findMany({ where: { programId } }),
  ]);

  const issues: string[] = [];

  // PLOs not supported by any course
  const coveredPlo = new Set(maps.map((m) => m.ploId));
  for (const p of plos) {
    if (!coveredPlo.has(p.id)) issues.push(`Chuẩn đầu ra ${p.code} chưa được học phần nào hỗ trợ.`);
  }

  // PLOs without a "Mastered" level
  const masteredPlo = new Set(maps.filter((m) => m.level === ContributionLevel.MASTERED).map((m) => m.ploId));
  for (const p of plos) {
    if (coveredPlo.has(p.id) && !masteredPlo.has(p.id))
      issues.push(`Chuẩn đầu ra ${p.code} chưa có học phần ở mức Mastered (thành thạo).`);
  }

  // Courses not mapped / overloaded
  const countByCourse = new Map<string, number>();
  for (const m of maps) countByCourse.set(m.courseId, (countByCourse.get(m.courseId) || 0) + 1);
  for (const c of courses) {
    const n = countByCourse.get(c.id) || 0;
    if (n === 0) issues.push(`Học phần ${c.code} chưa liên kết với chuẩn đầu ra nào.`);
    if (n > 4) issues.push(`Học phần ${c.code} đang gánh ${n} PLO — có thể quá tải, cần rà soát.`);
  }

  const res = await aiComplete({
    feature: "matrix_check",
    userId: user.id,
    maxTokens: 700,
    system:
      "Bạn là chuyên gia đảm bảo chất lượng giáo dục đại học, rà soát ma trận chuẩn đầu ra (CDIO/OBE). Trả lời tiếng Việt, ngắn gọn, có khuyến nghị cụ thể.",
    prompt: `Ma trận PLO – học phần có ${plos.length} PLO và ${courses.length} học phần. Các vấn đề tự động phát hiện:\n${
      issues.length ? issues.map((i) => `- ${i}`).join("\n") : "(không có)"
    }\n\nHãy nhận định mức độ cân đối của ma trận và đề xuất hành động khắc phục.`,
    fallback: () =>
      issues.length
        ? "Phát hiện các vấn đề trong ma trận (chế độ dự phòng):\n" + issues.map((i) => `• ${i}`).join("\n")
        : "Ma trận PLO – học phần cân đối: mọi PLO đều có học phần hỗ trợ và không có học phần quá tải.",
  });

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
  await logAudit({ userId: user.id, action: "AI_MATRIX_CHECK", entityType: "Program", entityId: programId });

  return { text: res.text, usedFallback: res.usedFallback, issues };
}
