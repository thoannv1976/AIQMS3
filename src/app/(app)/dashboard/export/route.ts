import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { allowedProgramIds } from "@/lib/access";
import { getManagementOverview } from "@/lib/quality/management";
import { esc, mdToHtml, wordDocument } from "@/lib/export/mdHtml";

/** Management report (QA12): Word (.doc) or printable page → PDF. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "doc";
  const facultyId = req.nextUrl.searchParams.get("faculty") || null;
  const o = await getManagementOverview({ programIds: await allowedProgramIds(user), facultyId });
  const brief = await prisma.aiAnalysisResult.findFirst({
    where: { type: "LEADERSHIP_BRIEF", targetType: "dashboard", targetId: facultyId ?? "all" },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();

  const programRows = o.programs
    .map(
      (p) =>
        `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.facultyName)}</td><td>${esc(p.standardSet ?? "—")}</td><td>${p.stats.readiness}%</td><td>${p.stats.coveredCriteria}/${p.stats.totalCriteria}</td><td>${p.stats.reportProgress}%</td><td>${p.stats.overdueTasks}</td><td>${esc(p.conditionMissing.join(", ") || "—")}</td></tr>`,
    )
    .join("");
  const facultyRows = o.faculties
    .map((f) => `<tr><td>${esc(f.name)}</td><td>${f.programs}</td><td>${f.avgReadiness}%</td><td>${f.pendingEvidence}</td><td>${f.overdueTasks}</td></tr>`)
    .join("");
  const evRows = o.evidenceByStatus.map((e) => `<tr><td>${esc(e.label)}</td><td>${e.count}</td></tr>`).join("");

  const body = `
<h1>Báo cáo quản trị chất lượng</h1>
<p><b>Phạm vi:</b> ${esc(o.scopeLabel)}<br/><b>Ngày lập:</b> ${now.toLocaleDateString("vi-VN")} · Người lập: ${esc(user.fullName)}</p>

<h2>1. Chỉ số chính</h2>
<table>
<tr><th>Chương trình đào tạo</th><td>${o.programs.length}</td><th>Chu kỳ kiểm định đang mở</th><td>${o.openCycles}</td></tr>
<tr><th>Mức sẵn sàng trung bình</th><td>${o.avgReadiness}%</td><th>Tổng minh chứng</th><td>${o.totalEvidence}</td></tr>
<tr><th>Minh chứng hết hiệu lực</th><td>${o.expired}</td><th>Sắp hết hiệu lực (≤60 ngày)</th><td>${o.expiring}</td></tr>
<tr><th>Nhiệm vụ quá hạn</th><td>${o.overdueTasks}</td><th>Kế hoạch cải tiến hoàn thành</th><td>${o.pdca.completed}/${o.pdca.total}</td></tr>
</table>

${o.faculties.length > 1 ? `<h2>2. Tổng hợp theo khoa</h2><table><tr><th>Khoa / Viện</th><th>Số CTĐT</th><th>Sẵn sàng TB</th><th>MC chờ duyệt</th><th>Việc quá hạn</th></tr>${facultyRows}</table>` : ""}

<h2>${o.faculties.length > 1 ? "3" : "2"}. Theo chương trình đào tạo</h2>
<table><tr><th>Mã</th><th>Chương trình</th><th>Khoa</th><th>Bộ tiêu chuẩn</th><th>Sẵn sàng</th><th>Tiêu chí có MC</th><th>SAR</th><th>Quá hạn</th><th>Tiêu chí điều kiện thiếu MC</th></tr>${programRows || `<tr><td colspan="9">Chưa có chương trình.</td></tr>`}</table>

<h2>${o.faculties.length > 1 ? "4" : "3"}. Minh chứng theo trạng thái</h2>
<table><tr><th>Trạng thái</th><th>Số lượng</th></tr>${evRows || `<tr><td colspan="2">Chưa có minh chứng.</td></tr>`}</table>
<p>30 ngày qua: tải lên ${o.last30.evidenceUploaded} minh chứng, duyệt ${o.last30.evidenceApproved}, ${o.last30.sectionsSaved} lần cập nhật mục báo cáo tự đánh giá.</p>

<h2>${o.faculties.length > 1 ? "5" : "4"}. Nhận định của AI cho lãnh đạo</h2>
${brief?.result ? `<p class="muted">Bản phân tích ngày ${brief.createdAt.toLocaleString("vi-VN")}${brief.usedFallback ? " (chế độ dự phòng)" : ""} — cần lãnh đạo xem xét.</p>${mdToHtml(brief.result)}` : `<p class="muted">Chưa có. Bấm “AI phân tích” trên Dashboard để tạo nhận định rồi xuất lại báo cáo.</p>`}
`;
  const html = wordDocument(`Báo cáo quản trị — ${o.scopeLabel}`, body, format === "pdf");
  if (format === "pdf") return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  return new Response(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="bao-cao-quan-tri-${now.toISOString().slice(0, 10)}.doc"`,
    },
  });
}
