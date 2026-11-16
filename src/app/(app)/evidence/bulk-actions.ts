"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { programRolesOf } from "@/lib/program-context";
import { canAccessProgram } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notify";
import { runEvidenceCheck } from "@/lib/evidence/check";
import { Confidentiality, EvidenceStatus } from "@/generated/prisma/enums";

export type BulkOp = "approve" | "needs_revision" | "link_criterion" | "set_validity" | "set_confidentiality" | "ai_check";

export interface BulkResult {
  ok: boolean;
  done: number;
  skipped: number;
  message: string;
}

const MAX_AI = 25;

/** Apply one operation to many evidence rows of a program. Locked rows keep their status. */
export async function bulkEvidenceAction(programId: string, fd: FormData): Promise<BulkResult> {
  const user = await requireUser();
  const ids = [...new Set(fd.getAll("ids").map(String))].filter(Boolean);
  const op = String(fd.get("op") || "") as BulkOp;
  if (!ids.length) return { ok: false, done: 0, skipped: 0, message: "Chưa chọn minh chứng nào." };
  if (!(await canAccessProgram(user, programId))) return { ok: false, done: 0, skipped: 0, message: "Không có quyền với chương trình." };
  const roles = await programRolesOf(user.id, programId);
  const canApprove = canInProgram(user.role, roles, "evidence:approve");
  const canWrite = canInProgram(user.role, roles, "evidence:write");
  const rows = await prisma.evidence.findMany({ where: { id: { in: ids }, programId }, select: { id: true, code: true, title: true, locked: true, uploadedById: true, status: true } });
  let done = 0;
  let skipped = ids.length - rows.length;

  if (op === "approve" || op === "needs_revision") {
    if (!canApprove) return { ok: false, done: 0, skipped: ids.length, message: "Bạn không có quyền duyệt minh chứng." };
    const note = String(fd.get("note") || "").trim();
    const approve = op === "approve";
    const byUploader = new Map<string, string[]>();
    for (const r of rows) {
      if (r.locked || (approve && (r.status === EvidenceStatus.APPROVED || r.status === EvidenceStatus.USED_IN_REPORT))) { skipped++; continue; }
      await prisma.evidence.update({
        where: { id: r.id },
        data: approve ? { status: EvidenceStatus.APPROVED, approvedById: user.id, approvedAt: new Date() } : { status: EvidenceStatus.NEEDS_REVISION },
      });
      done++;
      if (r.uploadedById && r.uploadedById !== user.id) byUploader.set(r.uploadedById, [...(byUploader.get(r.uploadedById) ?? []), r.code]);
    }
    for (const [uid, codes] of byUploader) {
      await createNotification({
        userId: uid,
        title: approve ? `${codes.length} minh chứng của bạn đã được duyệt` : `${codes.length} minh chứng cần bổ sung`,
        message: `${codes.slice(0, 12).join(", ")}${codes.length > 12 ? "…" : ""}${note ? ` — ${note}` : ""}`,
        link: `/evidence?program=${programId}${approve ? "" : "&status=NEEDS_REVISION"}`,
      });
    }
    await logAudit({ userId: user.id, action: approve ? "BULK_APPROVE" : "BULK_NEEDS_REVISION", entityType: "Evidence", entityId: null, detail: { programId, codes: rows.map((r) => r.code), note } });
  } else {
    if (!canWrite) return { ok: false, done: 0, skipped: ids.length, message: "Bạn không có quyền chỉnh sửa minh chứng." };
    if (op === "link_criterion") {
      const criterionId = String(fd.get("criterionId") || "");
      if (!criterionId) return { ok: false, done: 0, skipped: 0, message: "Chọn tiêu chí cần gán." };
      for (const r of rows) {
        await prisma.evidenceCriterionLink.upsert({ where: { evidenceId_criterionId: { evidenceId: r.id, criterionId } }, update: {}, create: { evidenceId: r.id, criterionId } });
        done++;
      }
    } else if (op === "set_validity") {
      const raw = String(fd.get("validUntil") || "");
      const validUntil = raw ? new Date(`${raw}T23:59:59`) : null;
      const res = await prisma.evidence.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { validUntil } });
      done = res.count;
    } else if (op === "set_confidentiality") {
      const level = String(fd.get("confidentiality") || "") as Confidentiality;
      if (!(level in Confidentiality)) return { ok: false, done: 0, skipped: 0, message: "Chọn mức bảo mật." };
      const res = await prisma.evidence.updateMany({ where: { id: { in: rows.map((r) => r.id) }, locked: false }, data: { confidentiality: level } });
      done = res.count;
      skipped += rows.length - res.count;
    } else if (op === "ai_check") {
      for (const r of rows.slice(0, MAX_AI)) {
        await runEvidenceCheck(r.id, { userId: user.id });
        done++;
      }
      skipped += Math.max(0, rows.length - MAX_AI);
    } else return { ok: false, done: 0, skipped: 0, message: "Thao tác không hợp lệ." };
    await logAudit({ userId: user.id, action: `BULK_${op.toUpperCase()}`, entityType: "Evidence", entityId: null, detail: { programId, codes: rows.map((r) => r.code) } });
  }
  revalidatePath("/evidence");
  revalidatePath("/evidence/matrix");
  const LABEL: Record<BulkOp, string> = {
    approve: "đã duyệt", needs_revision: "đã chuyển 'cần bổ sung'", link_criterion: "đã gán tiêu chí", set_validity: "đã đặt hiệu lực",
    set_confidentiality: "đã đổi mức bảo mật", ai_check: "đã được AI kiểm tra",
  };
  return { ok: true, done, skipped, message: `${done} minh chứng ${LABEL[op]}${skipped ? ` · bỏ qua ${skipped} (đã khóa/đã duyệt/vượt giới hạn ${MAX_AI} khi AI kiểm tra)` : ""}.` };
}

/** Re-run the AI check for one evidence (detail page button). */
export async function recheckEvidenceAction(evidenceId: string): Promise<void> {
  const user = await requireUser();
  const ev = await prisma.evidence.findUnique({ where: { id: evidenceId }, select: { programId: true } });
  if (!ev || !canInProgram(user.role, await programRolesOf(user.id, ev.programId), "evidence:write")) return;
  await runEvidenceCheck(evidenceId, { userId: user.id });
  revalidatePath(`/evidence/${evidenceId}`);
}
