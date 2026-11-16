import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { evidenceStrength } from "@/lib/quality/scoring";
import { evidenceStatus, confidentiality } from "@/lib/labels";

export async function GET(req: NextRequest) {
  await requireUser();
  const programId = req.nextUrl.searchParams.get("program");
  if (!programId) return new Response("Thiếu tham số program.", { status: 400 });

  const program = await prisma.program.findUnique({ where: { id: programId }, select: { code: true } });
  if (!program) return new Response("Không tìm thấy chương trình.", { status: 404 });

  const evidence = await prisma.evidence.findMany({
    where: { programId },
    orderBy: { code: "asc" },
    include: {
      uploadedBy: { select: { fullName: true } },
      criterionLinks: { include: { criterion: { select: { code: true } } } },
      document: { select: { summary: true, _count: { select: { chunks: true } } } },
    },
  });

  const rows = evidence.map((e) => {
    const strength = evidenceStrength({
      status: e.status,
      hasFile: Boolean(e.storagePath),
      isMachineReadable: (e.document?._count.chunks ?? 0) > 0,
      hasSummary: Boolean(e.document?.summary),
      criterionLinkCount: e.criterionLinks.length,
    });
    return {
      "Mã": e.code,
      "Tên minh chứng": e.title,
      "Đơn vị cung cấp": e.providerUnit ?? "",
      "Tiêu chí": e.criterionLinks.map((l) => l.criterion.code).join(", "),
      "Trạng thái": evidenceStatus[e.status].label,
      "Độ mạnh (/100)": strength.score,
      "Bảo mật": confidentiality[e.confidentiality].label,
      "Tệp đính kèm": e.fileName ?? "",
      "Người tải lên": e.uploadedBy?.fullName ?? "",
      "Cập nhật": e.updatedAt.toISOString().slice(0, 10),
    };
  });

  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 42 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
    { wch: 13 }, { wch: 12 }, { wch: 26 }, { wch: 20 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Danh mục minh chứng");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const slug = `${program.code}-danh-muc-minh-chung`.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug}.xlsx"`,
    },
  });
}
