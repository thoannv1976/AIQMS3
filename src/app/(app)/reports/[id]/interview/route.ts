import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProgram } from "@/lib/access";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Very small Markdown → HTML for Word export (headings, bold, lists, paragraphs). */
function mdToHtml(md: string): string {
  const out: string[] = [];
  let inList = false;
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const t = raw.trim();
    const b = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    if (/^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) {
      if (!inList) out.push("<ul>");
      inList = true;
      out.push(`<li>${b(t.replace(/^([-*•]|\d+[.)])\s+/, ""))}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) out.push(`<h${Math.min(h[1].length + 1, 4)}>${b(h[2])}</h${Math.min(h[1].length + 1, 4)}>`);
    else if (t) out.push(`<p>${b(t)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

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
