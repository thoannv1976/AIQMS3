"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { canAccessProgram } from "@/lib/access";
import { programRolesOf } from "@/lib/program-context";
import { logAudit } from "@/lib/audit";
import { filesFrom } from "@/lib/import/sheet";
import { parseStructureFiles, previewStructure, applyStructure, type StructurePreview } from "@/lib/import/program-structure";

async function guard(programId: string) {
  const user = await requireUser();
  if (!(await canAccessProgram(user, programId))) throw new Error("Không có quyền với chương trình này.");
  const roles = await programRolesOf(user.id, programId);
  if (!canInProgram(user.role, roles, "outcome:write") && !canInProgram(user.role, roles, "program:write")) {
    throw new Error("Bạn cần quyền chỉnh sửa chuẩn đầu ra hoặc chương trình.");
  }
  return user;
}

export type PreviewResult = { ok: true; preview: StructurePreview } | { ok: false; error: string };

export async function previewStructureImportAction(programId: string, fd: FormData): Promise<PreviewResult> {
  try {
    await guard(programId);
    const files = await filesFrom(fd);
    if (!files.length) return { ok: false, error: "Chọn ít nhất một tệp Excel." };
    const plan = await parseStructureFiles(files);
    return { ok: true, preview: await previewStructure(programId, plan) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi đọc tệp." };
  }
}

export async function applyStructureImportAction(
  programId: string,
  fd: FormData,
): Promise<{ ok: true; result: Awaited<ReturnType<typeof applyStructure>> } | { ok: false; error: string }> {
  try {
    const user = await guard(programId);
    const files = await filesFrom(fd);
    const plan = await parseStructureFiles(files);
    const result = await applyStructure(programId, plan);
    await logAudit({ userId: user.id, action: "IMPORT", entityType: "ProgramStructure", entityId: programId, detail: { files: files.map((f) => f.name), ...result } });
    revalidatePath(`/programs/${programId}`);
    revalidatePath("/outcomes");
    revalidatePath("/syllabi");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi nhập dữ liệu." };
  }
}
