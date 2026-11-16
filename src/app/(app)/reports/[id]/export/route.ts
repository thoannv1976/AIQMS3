import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { canAccessProgram } from "@/lib/access";
import { renderReportHtml } from "@/lib/export/sarReport";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "doc";
  const out = await renderReportHtml(id, { autoPrint: format === "pdf" });
  if (!out || !(await canAccessProgram(user, out.programId))) return new Response("Không tìm thấy báo cáo.", { status: 404 });

  if (format === "pdf") {
    // Printable page (browser → Save as PDF).
    return new Response(out.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return new Response(out.html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${out.slug}.doc"`,
    },
  });
}
