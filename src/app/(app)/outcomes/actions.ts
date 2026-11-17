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

  // Give the AI the matrix itself, not only the rule findings: per-PLO I/R/M profile with the
  // semesters where each level appears, and a compact course × PLO listing.
  const LV = { [ContributionLevel.INTRODUCED]: "I", [ContributionLevel.REINFORCED]: "R", [ContributionLevel.MASTERED]: "M" } as const;
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const ploById = new Map(plos.map((p) => [p.id, p]));
  const sem = (xs: Array<number | null | undefined>) => xs.filter((x): x is number => x != null);
  const ploLines = plos.map((p) => {
    const rows = maps.filter((m) => m.ploId === p.id);
    const by = (lv: ContributionLevel) => rows.filter((m) => m.level === lv).map((m) => courseById.get(m.courseId)).filter(Boolean);
    const [i, r, mm] = [by(ContributionLevel.INTRODUCED), by(ContributionLevel.REINFORCED), by(ContributionLevel.MASTERED)];
    const firstI = Math.min(...sem(i.map((c) => c!.semester)), 99);
    const firstM = Math.min(...sem(mm.map((c) => c!.semester)), 99);
    if (mm.length && i.length && firstM < firstI) issues.push(`${p.code}: học phần mức M (HK${firstM}) đứng trước mức I (HK${firstI}) — trình tự I → R → M chưa hợp lý.`);
    const span = (cs: typeof i) => (cs.length ? ` [HK ${sem(cs.map((c) => c!.semester)).sort((a, b) => a - b).join(",") || "?"}]` : "");
    return `${p.code} (${p.description.slice(0, 90)}): I=${i.length}${span(i)}, R=${r.length}${span(r)}, M=${mm.length}${span(mm)}; M ở: ${mm.map((c) => c!.code).join(", ") || "—"}`;
  });
  const courseLines = courses
    .map((c) => {
      const row = maps.filter((m) => m.courseId === c.id).map((m) => `${ploById.get(m.ploId)?.code}:${LV[m.level]}`);
      return row.length ? `${c.code} (HK${c.semester ?? "?"}, ${c.credits}TC): ${row.join(" ")}` : null;
    })
    .filter(Boolean);

  const res = await aiComplete({
    feature: "matrix_check",
    userId: user.id,
    maxTokens: 1400,
    system:
      "Bạn là chuyên gia đảm bảo chất lượng giáo dục đại học, rà soát ma trận chuẩn đầu ra (CDIO/OBE). Trả lời tiếng Việt, ngắn gọn, có khuyến nghị cụ thể. Chỉ dựa trên dữ liệu được cung cấp.",
    prompt: `Ma trận PLO – học phần có ${plos.length} PLO, ${courses.length} học phần, ${maps.length} ô liên kết.

Hồ sơ từng PLO (số học phần ở mức I/R/M, học kỳ tương ứng):
${ploLines.join("\n") || "(chưa có PLO)"}

Ma trận theo học phần (mã PLO:mức):
${courseLines.join("\n") || "(chưa có liên kết)"}

Các vấn đề tự động phát hiện:
${issues.length ? issues.map((i) => `- ${i}`).join("\n") : "(không có)"}

Hãy: (1) nhận định mức độ cân đối của ma trận (độ phủ, PLO quá ít/quá nhiều học phần, trình tự I → R → M theo học kỳ); (2) chỉ ra PLO hoặc học phần cần điều chỉnh, kèm lý do từ dữ liệu; (3) đề xuất hành động khắc phục cụ thể.`,
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
