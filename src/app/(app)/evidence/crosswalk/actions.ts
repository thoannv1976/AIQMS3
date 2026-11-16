"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { canAccessProgram, evidenceVisibilityWhere } from "@/lib/access";
import { programRolesOf } from "@/lib/program-context";
import { logAudit } from "@/lib/audit";
import { filesFrom } from "@/lib/import/sheet";
import { parseCrosswalkFiles, planCrosswalk, applyCrosswalk, type CrosswalkOptions, type CrosswalkPlan } from "@/lib/import/crosswalk";

async function guard(programId: string) {
  const user = await requireUser();
  if (!programId || !(await canAccessProgram(user, programId))) throw new Error("Không có quyền với chương trình này.");
  const roles = await programRolesOf(user.id, programId);
  if (!canInProgram(user.role, roles, "evidence:write")) throw new Error("Bạn cần quyền chỉnh sửa minh chứng.");
  return user;
}

function optionsFrom(fd: FormData): CrosswalkOptions {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  return {
    targetSetId: s("targetSetId"),
    source: s("source") === "identity" ? "identity" : "file",
    oldFrom: s("oldFrom") === "code" ? "code" : "links",
    sourceSetId: s("sourceSetId") || null,
    rename: s("rename") === "1",
  };
}

/** Parse the mapping file (if any) and build the plan from current DB state. */
async function buildPlan(user: Awaited<ReturnType<typeof guard>>, programId: string, fd: FormData) {
  const opts = optionsFrom(fd);
  let mapping = null;
  if (opts.source === "file") {
    const files = await filesFrom(fd);
    if (!files.length) throw new Error("Chọn tệp Excel bảng chuyển mã.");
    mapping = await parseCrosswalkFiles(files);
    if (!mapping.criterion.length && !mapping.evidence.length) throw new Error("Không đọc được dòng chuyển mã nào trong tệp.");
  }
  return planCrosswalk(programId, await evidenceVisibilityWhere(user, programId), opts, mapping);
}

export type CrosswalkPreview = Omit<CrosswalkPlan, "work">;
export type CrosswalkPreviewResult = { ok: true; preview: CrosswalkPreview } | { ok: false; error: string };

export async function previewCrosswalkAction(programId: string, fd: FormData): Promise<CrosswalkPreviewResult> {
  try {
    const user = await guard(programId);
    const { options, targetSet, rows, mapping, totals } = await buildPlan(user, programId, fd);
    return { ok: true, preview: { options, targetSet, rows, mapping, totals } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi đọc dữ liệu." };
  }
}

export type CrosswalkApplyResult =
  | { ok: true; result: { evidence: number; linksCreated: number; renamed: number } }
  | { ok: false; error: string };

export async function applyCrosswalkAction(programId: string, fd: FormData): Promise<CrosswalkApplyResult> {
  try {
    const user = await guard(programId);
    // Re-compute everything on the server; only the options and the mapping file come from the client.
    const plan = await buildPlan(user, programId, fd);
    if (!plan.work.length) return { ok: false, error: "Không có minh chứng nào để chuyển mã." };
    const result = await applyCrosswalk(plan);
    await logAudit({
      userId: user.id,
      action: "EVIDENCE_CROSSWALK",
      entityType: "Program",
      entityId: programId,
      detail: {
        ...plan.options,
        targetSet: plan.targetSet.code,
        files: fd.getAll("files").flatMap((f) => (typeof f === "string" ? [] : [f.name])),
        ...result,
        renames: plan.work.filter((w) => w.newCode).map((w) => ({ from: w.oldCode, to: w.newCode })),
      },
    });
    revalidatePath("/evidence");
    revalidatePath("/evidence/matrix");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi chuyển mã." };
  }
}
