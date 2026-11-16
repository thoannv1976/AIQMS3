"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { filesFrom } from "@/lib/import/sheet";
import { parseUserFiles, applyUsers, type UserPlan } from "@/lib/import/users";

async function guard() {
  const user = await requireUser();
  if (!can(user.role, "admin:users")) throw new Error("Bạn không có quyền quản trị người dùng.");
  return user;
}
const opts = (fd: FormData) => ({
  defaultProgramId: String(fd.get("defaultProgramId") || "") || null,
  defaultExpires: String(fd.get("defaultExpires") || "") || null,
});

export async function previewUserImportAction(fd: FormData): Promise<{ ok: true; plan: UserPlan } | { ok: false; error: string }> {
  try {
    await guard();
    const files = await filesFrom(fd);
    if (!files.length) return { ok: false, error: "Chọn tệp Excel danh sách tài khoản." };
    return { ok: true, plan: await parseUserFiles(files, opts(fd)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi đọc tệp." };
  }
}

export async function applyUserImportAction(fd: FormData): Promise<
  { ok: true; result: Awaited<ReturnType<typeof applyUsers>> } | { ok: false; error: string }
> {
  try {
    const actor = await guard();
    const files = await filesFrom(fd);
    const plan = await parseUserFiles(files, opts(fd));
    const result = await applyUsers(plan);
    await logAudit({
      userId: actor.id,
      action: "IMPORT",
      entityType: "User",
      entityId: null,
      detail: { files: files.map((f) => f.name), created: result.created, updated: result.updated, assigned: result.assigned },
    });
    revalidatePath("/admin/users");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi nhập tài khoản." };
  }
}
