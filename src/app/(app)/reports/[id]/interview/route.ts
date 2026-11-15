import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProgram } from "@/lib/access";
import { esc, mdToHtml } from "@/lib/export/mdHtml";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const report = await prisma.selfAssessmentReport.findUnique({ where: { id }, include: { cycle: { include: { program: true } } } });
  if (!report || !(await canAccessProgram(user, report.cycle.programId))) return new Response("Không tìm thấy báo cáo.", { status: 404 });
  const latest = await prisma.aiAnalysisResult.findFirst({
    where: { type: "INTERVIEW_QUESTIONS", targetType: "report", targetId: id },
    orderBy: { createdAt: "desc" },
  });
  if (!latest?.result) return new Response("Chưa có bộ câu hỏi. Hãy bấm “AI gợi ý câu hỏi” trước.", { status: 404 });
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Câu hỏi phỏng vấn</title>
<style>body{font-family:Arial;font-size:11pt;line-height:1.45} h1{font-size:16pt;color:#1F4E9A} h2{font-size:13pt;color:#2E75B6} h3{font-size:12pt}</style></head><body>
<h1>Bộ câu hỏi phỏng vấn dự kiến của đoàn đánh giá ngoài</h1>
<p><b>${esc(report.cycle.program.code)} — ${esc(report.cycle.program.nameVi)}</b><br/>${esc(report.title)}<br/>Tạo ngày ${latest.createdAt.toLocaleDateString("vi-VN")} · Bản gợi ý của AI, cần hội đồng tự đánh giá rà soát.</p>
${mdToHtml(latest.result)}
</body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.cycle.program.code}-cau-hoi-phong-van.doc"`,
    },
  });
}
