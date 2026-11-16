// Download the whole accreditation dossier of a program as a zip:
//   TC1_Muc_tieu.../1.1_.../MC-1.1.01_Ten.pdf  +  Muc_luc_minh_chung.xlsx  +  Bao_cao_tu_danh_gia.doc
// Default: approved, still-valid evidence only (what goes to the accreditation body); ?all=1 adds every visible evidence.
import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import archiver from "archiver";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { programRolesOf } from "@/lib/program-context";
import { canAccessProgram, evidenceVisibilityWhere, APPROVED_LIKE, validityState } from "@/lib/access";
import { readFile } from "@/lib/storage";
import { renderReportHtml } from "@/lib/export/sarReport";
import { logAudit } from "@/lib/audit";
import { evidenceStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** ASCII, filesystem-safe name (Vietnamese accents removed) – zip tools on Windows handle it everywhere. */
function safe(s: string, max = 60): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9.\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const programId = req.nextUrl.searchParams.get("program") ?? "";
  const includeAll = req.nextUrl.searchParams.get("all") === "1";
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { id: true, code: true, nameVi: true } });
  if (!program || !(await canAccessProgram(user, programId))) return new Response("Không tìm thấy chương trình.", { status: 404 });
  if (!canInProgram(user.role, await programRolesOf(user.id, programId), "evidence:view")) return new Response("Không có quyền.", { status: 403 });

  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    include: {
      standardSet: { include: { standards: { orderBy: { order: "asc" }, include: { criteria: { orderBy: { order: "asc" } } } } } },
      reports: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });
  const where = await evidenceVisibilityWhere(user, programId);
  const evidence = await prisma.evidence.findMany({
    where: includeAll ? where : { ...where, status: { in: APPROVED_LIKE } },
    orderBy: { code: "asc" },
    include: { criterionLinks: { include: { criterion: { select: { id: true, code: true } } } } },
  });
  const usable = includeAll ? evidence : evidence.filter((e) => validityState(e.validUntil) !== "expired");

  // Folder per criterion, in standard order; evidence goes under its first criterion (others listed in the index).
  const critOrder = new Map<string, number>();
  const critFolder = new Map<string, string>();
  let k = 0;
  for (const st of cycle?.standardSet.standards ?? []) {
    const stDir = `TC${st.code}_${safe(st.title, 40)}`;
    for (const c of st.criteria) {
      critOrder.set(c.id, k++);
      critFolder.set(c.id, `${stDir}/${c.code}_${safe(c.title, 40)}`);
    }
  }
  const root = safe(`Ho_so_minh_chung_${program.code}`);
  const rows = usable.map((e) => {
    const links = [...e.criterionLinks].sort((a, b) => (critOrder.get(a.criterionId) ?? 1e9) - (critOrder.get(b.criterionId) ?? 1e9));
    const primary = links.find((l) => critFolder.has(l.criterionId));
    const ext = (e.fileName?.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? "").toLowerCase();
    const dir = primary ? critFolder.get(primary.criterionId)! : "Chua_gan_tieu_chi";
    return { e, links, path: e.storagePath ? `${dir}/${safe(e.code, 30)}_${safe(e.title, 50)}${ext}` : null };
  });

  const archive = archiver("zip", { zlib: { level: 6 } });
  const fill = async () => {
    try {
      const missing: string[] = [];
      for (const r of rows) {
        if (!r.path || !r.e.storagePath) continue;
        try {
          archive.append(await readFile(r.e.storagePath), { name: `${root}/${r.path}` });
        } catch {
          missing.push(r.e.code);
          r.path = null;
        }
      }
      // Index workbook.
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Mục lục minh chứng");
      ws.addRow([`Hồ sơ minh chứng ${program.code} — ${program.nameVi}`]).font = { bold: true, size: 13 };
      ws.addRow([`${cycle ? `Chu kỳ: ${cycle.name} · ` : ""}Xuất ngày ${formatDate(new Date())} · ${includeAll ? "Mọi minh chứng được xem" : "Chỉ minh chứng đã duyệt, còn hiệu lực"} · ${rows.length} minh chứng`]);
      ws.addRow([]);
      const head = ws.addRow(["STT", "Mã", "Tên minh chứng", "Tiêu chí chính", "Tiêu chí liên quan", "Đơn vị", "Ngày ban hành", "Hiệu lực đến", "Trạng thái", "Đường dẫn trong zip"]);
      head.font = { bold: true, color: { argb: "FFFFFFFF" } };
      head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
      rows.forEach((r, i) =>
        ws.addRow([
          i + 1, r.e.code, r.e.title, r.links[0]?.criterion.code ?? "", r.links.slice(1).map((l) => l.criterion.code).join(", "),
          r.e.providerUnit ?? "", r.e.issuedAt ? formatDate(r.e.issuedAt) : "", r.e.validUntil ? formatDate(r.e.validUntil) : "",
          evidenceStatus[r.e.status].label, r.path ?? "(không có tệp)",
        ]),
      );
      [6, 16, 60, 12, 18, 26, 14, 14, 16, 80].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      ws.views = [{ state: "frozen", ySplit: 4 }];
      if (missing.length) ws.addRow([`Không đọc được tệp: ${missing.join(", ")}`]);
      archive.append(Buffer.from(await wb.xlsx.writeBuffer()), { name: `${root}/00_Muc_luc_minh_chung.xlsx` });

      const reportId = cycle?.reports[0]?.id;
      if (reportId) {
        const rep = await renderReportHtml(reportId);
        if (rep) archive.append(rep.html, { name: `${root}/00_Bao_cao_tu_danh_gia_${program.code}.doc` });
      }
      archive.append(
        [
          `HỒ SƠ MINH CHỨNG ${program.code} — ${program.nameVi}`,
          "",
          "- 00_Muc_luc_minh_chung.xlsx: danh mục, tiêu chí chính/liên quan, đường dẫn từng tệp.",
          "- 00_Bao_cao_tu_danh_gia_*.doc: báo cáo tự đánh giá (mở bằng Word).",
          "- Thư mục TC<số>_.../<mã tiêu chí>_...: minh chứng theo tiêu chí chính. Minh chứng dùng cho nhiều tiêu chí chỉ lưu một bản; xem cột 'Tiêu chí liên quan'.",
          "",
          "Xuất từ hệ thống AIQMS3.",
        ].join("\r\n"),
        { name: `${root}/README.txt` },
      );
    } catch (e) {
      console.error("[dossier] build failed:", e);
    } finally {
      await archive.finalize();
    }
  };
  void fill();
  await logAudit({ userId: user.id, action: "EXPORT_DOSSIER", entityType: "Program", entityId: programId, detail: { files: rows.length, includeAll } });

  return new Response(Readable.toWeb(archive) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${root}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
