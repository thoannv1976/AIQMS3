import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProgram, evidenceVisibilityWhere } from "@/lib/access";
import { buildEvidenceMatrix } from "@/lib/evidence/matrix";

const STATE_LABEL = { approved: "đã duyệt", pending: "chưa duyệt", expired: "hết hiệu lực" } as const;

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const programId = req.nextUrl.searchParams.get("program");
  if (!programId) return new Response("Thiếu tham số program.", { status: 400 });
  if (!(await canAccessProgram(user, programId))) return new Response("Không có quyền.", { status: 403 });
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { code: true } });
  const data = await buildEvidenceMatrix(programId, await evidenceVisibilityWhere(user, programId));
  if (!program || !data) return new Response("Chưa có chu kỳ kiểm định.", { status: 404 });

  const rows = data.standards.flatMap((s) =>
    s.rows.map((r) => ({
      "Tiêu chuẩn": `${s.code}. ${s.title}`,
      "Tiêu chí": r.code,
      "Tiêu chí điều kiện": r.condition ? "Có" : "",
      "Nội dung tiêu chí": r.title,
      "Số minh chứng": r.evidence.length,
      "Đã duyệt": r.evidence.filter((e) => e.state === "approved").length,
      "Minh chứng": r.evidence.map((e) => `${e.code} (${STATE_LABEL[e.state]})`).join("; "),
    })),
  );
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 40 }, { wch: 8 }, { wch: 10 }, { wch: 60 }, { wch: 10 }, { wch: 9 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ma tran tieu chi - MC");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${program.code.replace(/[^a-zA-Z0-9_-]+/g, "-")}-ma-tran-tieu-chi-minh-chung.xlsx"`,
    },
  });
}
