import { requireUser } from "@/lib/auth";
import { structureTemplate, XLSX_TYPE } from "@/lib/import/templates";

export async function GET() {
  await requireUser();
  const buf = await structureTemplate();
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="Mau_nhap_cau_truc_CTDT.xlsx"` },
  });
}
