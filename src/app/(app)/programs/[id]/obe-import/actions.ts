"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { canAccessProgram } from "@/lib/access";
import { programRolesOf } from "@/lib/program-context";
import { logAudit } from "@/lib/audit";
import { filesFrom } from "@/lib/import/sheet";
import { parseObeFiles, previewObe, applyObe, type ObePreview } from "@/lib/import/obe";

async function guard(programId: string) {
  const user = await requireUser();
  if (!(await canAccessProgram(user, programId))) throw new Error("Không có quyền với chương trình này.");
  if (!canInProgram(user.role, await programRolesOf(user.id, programId), "obe:write")) throw new Error("Bạn cần quyền nhập dữ liệu đạt chuẩn đầu ra (OBE).");
  return user;
}

const skippedSheets = (fd: FormData) => fd.getAll("skip").map(String).filter(Boolean);

export type ObePreviewResult = { ok: true; preview: ObePreview } | { ok: false; error: string };

export async function previewObeImportAction(programId: string, fd: FormData): Promise<ObePreviewResult> {
  try {
    await guard(programId);
    const files = await filesFrom(fd);
    if (!files.length) return { ok: false, error: "Chọn ít nhất một tệp Excel." };
    return { ok: true, preview: await previewObe(programId, await parseObeFiles(files, { skip: skippedSheets(fd) })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi đọc tệp." };
  }
}

export async function applyObeImportAction(
  programId: string,
  fd: FormData,
): Promise<{ ok: true; result: Awaited<ReturnType<typeof applyObe>> } | { ok: false; error: string }> {
  try {
    const user = await guard(programId);
    const files = await filesFrom(fd);
    const plan = await parseObeFiles(files, { skip: skippedSheets(fd) });
    if (!plan.rows.length) return { ok: false, error: "Không có dòng hợp lệ để nhập." };
    const result = await applyObe(programId, plan, { replace: fd.get("replace") === "1" });
    await logAudit({ userId: user.id, action: "IMPORT", entityType: "OutcomeAssessment", entityId: programId, detail: { files: files.map((f) => f.name), ...result } });
    revalidatePath("/obe");
    revalidatePath("/dashboard");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi nhập dữ liệu." };
  }
}
