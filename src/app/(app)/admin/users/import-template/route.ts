import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { usersTemplate, XLSX_TYPE } from "@/lib/import/templates";

export async function GET() {
  const user = await requireUser();
  if (!can(user.role, "admin:users")) return new Response("Forbidden", { status: 403 });
  const buf = await usersTemplate();
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="Mau_nhap_tai_khoan.xlsx"` },
  });
}
