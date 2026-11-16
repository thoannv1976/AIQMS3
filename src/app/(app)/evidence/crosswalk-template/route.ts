import { requireUser } from "@/lib/auth";
import { crosswalkTemplate } from "@/lib/import/crosswalk";
import { XLSX_TYPE } from "@/lib/import/templates";

export async function GET() {
  await requireUser();
  const buf = await crosswalkTemplate();
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="Mau_bang_chuyen_ma_tieu_chi.xlsx"` },
  });
}
