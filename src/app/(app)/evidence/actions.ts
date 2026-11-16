"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, canInProgram } from "@/lib/rbac";
import { programRolesOf } from "@/lib/program-context";
import { logAudit } from "@/lib/audit";
import { saveFile, buildEvidencePath, readFile } from "@/lib/storage";
import { createEvidence, parseDate, scheduleProcessing, type CreateEvidenceResult } from "@/lib/evidence/upload";
import { createNotification } from "@/lib/notify";
import { processEvidenceDocument, markDocumentProcessing, markDocumentFailed } from "@/lib/ai/documents";
import { after } from "next/server";
import { summarizeText, suggestCriteria } from "@/lib/ai/features";
import { EvidenceStatus, AiAnalysisType, Confidentiality } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
  duplicate?: { id: string; code: string; title: string };
}

export async function uploadEvidence(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const programId = String(formData.get("programId") || "");
  if (!programId) return { error: "Thiếu chương trình." };
  if (!canInProgram(user.role, await programRolesOf(user.id, programId), "evidence:write")) {
    return { error: "Bạn không có quyền tải minh chứng cho chương trình này." };
  }
  const res = await createEvidence({
    userId: user.id,
    userUnit: user.unit,
    programId,
    code: String(formData.get("code") || ""),
    title: String(formData.get("title") || ""),
    description: String(formData.get("description") || "").trim() || null,
    providerUnit: String(formData.get("providerUnit") || "").trim() || null,
    confidentiality: (String(formData.get("confidentiality") || "INTERNAL") as Confidentiality) || "INTERNAL",
    criterionId: String(formData.get("criterionId") || "") || null,
    issuedAt: parseDate(formData.get("issuedAt")),
    validUntil: parseDate(formData.get("validUntil")),
    file: formData.get("file") as File | null,
    force: formData.get("force") === "on",
  });
  if (!res.ok) return { error: res.error, duplicate: res.duplicate };
  revalidatePath("/evidence");
  redirect(`/evidence/${res.id}`);
}

/** One file of a bulk upload (called sequentially by the client, one request per file). */
export async function uploadEvidenceItemAction(formData: FormData): Promise<CreateEvidenceResult> {
  const user = await requireUser();
  const programId = String(formData.get("programId") || "");
  if (!programId || !canInProgram(user.role, await programRolesOf(user.id, programId), "evidence:write")) {
    return { ok: false, error: "Không có quyền tải minh chứng cho chương trình này." };
  }
  const res = await createEvidence({
    userId: user.id,
    userUnit: user.unit,
    programId,
    code: String(formData.get("code") || ""),
    title: String(formData.get("title") || ""),
    providerUnit: String(formData.get("providerUnit") || "").trim() || null,
    confidentiality: (String(formData.get("confidentiality") || "INTERNAL") as Confidentiality) || "INTERNAL",
    criterionId: String(formData.get("criterionId") || "") || null,
    issuedAt: parseDate(formData.get("issuedAt")),
    validUntil: parseDate(formData.get("validUntil")),
    file: formData.get("file") as File | null,
    force: formData.get("force") === "1",
  });
  if (res.ok) revalidatePath("/evidence");
  return res;
}

async function loadEditable(evidenceId: string, capability: "evidence:write" | "evidence:approve") {
  const user = await requireUser();
  const ev = await prisma.evidence.findUnique({ where: { id: evidenceId } });
  if (!ev) return null;
  if (!canInProgram(user.role, await programRolesOf(user.id, ev.programId), capability)) return null;
  return { user, ev };
}

function bumpVersion(v: string): string {
  const major = parseInt(v.split(".")[0] || "1", 10);
  return `${(Number.isFinite(major) ? major : 1) + 1}.0`;
}

/** Replace the file with a new version; the previous file is kept in the version history. */
export async function uploadNewVersionAction(evidenceId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await loadEditable(evidenceId, "evidence:write");
  if (!ctx) return { error: "Không có quyền cập nhật minh chứng này." };
  const { user, ev } = ctx;
  if (ev.locked) return { error: "Minh chứng đang khóa phiên bản — cần mở khóa trước khi tải bản mới." };
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Chọn tệp phiên bản mới." };
  const buffer = Buffer.from(await file.arrayBuffer());

  const program = await prisma.program.findUnique({ where: { id: ev.programId } });
  const rel = buildEvidencePath({
    programCode: program?.code ?? "PRG",
    year: new Date().getFullYear(),
    criterionCode: null,
    fileName: file.name,
  });
  const stored = await saveFile(rel, buffer, file.type || undefined);
  const version = bumpVersion(ev.version);

  await prisma.$transaction([
    prisma.evidenceFileVersion.create({
      data: {
        evidenceId,
        version: ev.version,
        fileName: ev.fileName,
        fileType: ev.fileType,
        fileSize: ev.fileSize,
        storagePath: ev.storagePath,
        checksum: ev.checksum,
        uploadedById: ev.uploadedById,
        note: String(formData.get("note") || "").trim() || null,
      },
    }),
    prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        version,
        fileName: file.name,
        fileType: file.type || null,
        fileSize: file.size,
        storagePath: stored.storagePath,
        checksum: stored.checksum,
        status: EvidenceStatus.UPLOADED,
        approvedById: null,
        approvedAt: null,
        uploadedById: user.id,
        issuedAt: parseDate(formData.get("issuedAt")) ?? ev.issuedAt,
        validUntil: parseDate(formData.get("validUntil")) ?? ev.validUntil,
      },
    }),
  ]);
  await logAudit({ userId: user.id, action: "NEW_VERSION", entityType: "Evidence", entityId: evidenceId, detail: { from: ev.version, to: version } });
  await markDocumentProcessing({ evidenceId, programId: ev.programId, fileName: file.name, fileType: file.type || null });
  scheduleProcessing({ evidenceId, programId: ev.programId, buffer, fileName: file.name, fileType: file.type || undefined });
  revalidatePath(`/evidence/${evidenceId}`);
  return {};
}

export async function setEvidenceLockAction(evidenceId: string, locked: boolean): Promise<void> {
  const ctx = await loadEditable(evidenceId, "evidence:approve");
  if (!ctx) return;
  await prisma.evidence.update({
    where: { id: evidenceId },
    data: locked ? { locked: true, lockedAt: new Date(), lockedById: ctx.user.id } : { locked: false, lockedAt: null, lockedById: null },
  });
  await logAudit({ userId: ctx.user.id, action: locked ? "LOCK" : "UNLOCK", entityType: "Evidence", entityId: evidenceId });
  revalidatePath(`/evidence/${evidenceId}`);
}

export async function updateEvidenceValidityAction(evidenceId: string, formData: FormData): Promise<void> {
  const ctx = await loadEditable(evidenceId, "evidence:write");
  if (!ctx || ctx.ev.locked) return;
  await prisma.evidence.update({
    where: { id: evidenceId },
    data: { issuedAt: parseDate(formData.get("issuedAt")), validUntil: parseDate(formData.get("validUntil")) },
  });
  await logAudit({ userId: ctx.user.id, action: "UPDATE", entityType: "Evidence", entityId: evidenceId, detail: { validity: true } });
  revalidatePath(`/evidence/${evidenceId}`);
  revalidatePath("/evidence");
}

/**
 * AI-classify evidence that has no criterion yet: run the criterion suggestion and attach
 * the best match flagged "AI" (a human can remove it). Capped per call to control cost.
 */
export async function bulkAiClassifyAction(programId: string): Promise<{ processed: number; linked: number }> {
  const user = await requireUser();
  if (!canInProgram(user.role, await programRolesOf(user.id, programId), "evidence:write")) return { processed: 0, linked: 0 };
  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    include: { standardSet: { include: { standards: { include: { criteria: true } } } } },
  });
  if (!cycle) return { processed: 0, linked: 0 };
  const criteria = cycle.standardSet.standards.flatMap((s) => s.criteria);
  const items = await prisma.evidence.findMany({
    where: { programId, criterionLinks: { none: {} }, locked: false },
    include: { document: true },
    take: 30,
  });
  let linked = 0;
  for (const ev of items) {
    const text = ev.document?.extractedText || ev.description || ev.title;
    const res = await suggestCriteria(
      text,
      criteria.map((c) => ({ id: c.id, code: c.code, title: c.title, description: c.description })),
      { userId: user.id },
    );
    const best = res.data[0];
    if (best) {
      await prisma.evidenceCriterionLink.upsert({
        where: { evidenceId_criterionId: { evidenceId: ev.id, criterionId: best.id } },
        update: {},
        create: { evidenceId: ev.id, criterionId: best.id, suggestedByAi: true },
      });
      linked++;
    }
  }
  await logAudit({ userId: user.id, action: "AI_BULK_CLASSIFY", entityType: "Program", entityId: programId, detail: { processed: items.length, linked } });
  revalidatePath("/evidence");
  return { processed: items.length, linked };
}

export async function reprocessEvidenceAction(evidenceId: string): Promise<void> {
  const user = await requireUser();
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    select: { id: true, programId: true, storagePath: true, fileName: true, fileType: true },
  });
  if (!evidence?.storagePath || !evidence.fileName) return;
  if (!canInProgram(user.role, await programRolesOf(user.id, evidence.programId ?? ""), "evidence:write")) return;

  await markDocumentProcessing({ evidenceId: evidence.id, programId: evidence.programId, fileName: evidence.fileName, fileType: evidence.fileType });
  const storagePath = evidence.storagePath;
  const job = { evidenceId: evidence.id, programId: evidence.programId, fileName: evidence.fileName, fileType: evidence.fileType ?? undefined };
  after(async () => {
    try {
      const buffer = await readFile(storagePath);
      await processEvidenceDocument({ ...job, buffer });
    } catch (e) {
      console.error("[evidence] reprocess failed:", e);
      await markDocumentFailed(job.evidenceId);
    }
  });
  await logAudit({ userId: user.id, action: "REPROCESS", entityType: "Evidence", entityId: evidenceId });
  revalidatePath(`/evidence/${evidenceId}`);
}

export async function summarizeEvidenceAction(evidenceId: string): Promise<{ text: string; usedFallback: boolean }> {
  const user = await requireUser();
  const evidence = await prisma.evidence.findUnique({ where: { id: evidenceId }, include: { document: true } });
  if (!evidence) return { text: "Không tìm thấy minh chứng.", usedFallback: true };

  const text = evidence.document?.extractedText || evidence.description || evidence.title;
  const res = await summarizeText(text, evidence.title, { userId: user.id });

  await prisma.aiAnalysisResult.create({
    data: {
      type: AiAnalysisType.SUMMARY,
      targetType: "evidence",
      targetId: evidenceId,
      result: res.text,
      model: res.model,
      usedFallback: res.usedFallback,
      createdById: user.id,
    },
  });
  if (evidence.document) {
    await prisma.document.update({ where: { id: evidence.document.id }, data: { summary: res.text } });
  }
  await logAudit({ userId: user.id, action: "AI_SUMMARY", entityType: "Evidence", entityId: evidenceId });
  return { text: res.text, usedFallback: res.usedFallback };
}

export async function suggestCriteriaAction(
  evidenceId: string,
): Promise<{ text: string; usedFallback: boolean; suggestions: Array<{ id: string; code: string; title: string; score: number }> }> {
  const user = await requireUser();
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    include: { document: true, cycle: { include: { standardSet: { include: { standards: { include: { criteria: true } } } } } } },
  });
  if (!evidence) return { text: "Không tìm thấy minh chứng.", usedFallback: true, suggestions: [] };

  // Suggest against the program's current (latest) cycle, like "AI phân loại" does; the
  // cycle stamped on the evidence at upload time may be an older standard set.
  const cycle =
    (await prisma.accreditationCycle.findFirst({
      where: { programId: evidence.programId },
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      include: { standardSet: { include: { standards: { include: { criteria: true } } } } },
    })) ?? evidence.cycle;

  const criteria = cycle ? cycle.standardSet.standards.flatMap((s) => s.criteria) : [];
  const text = evidence.document?.extractedText || evidence.description || evidence.title;
  const res = await suggestCriteria(
    text,
    criteria.map((c) => ({ id: c.id, code: c.code, title: c.title, description: c.description })),
    { userId: user.id },
  );

  await prisma.aiAnalysisResult.create({
    data: {
      type: AiAnalysisType.CRITERION_SUGGESTION,
      targetType: "evidence",
      targetId: evidenceId,
      result: res.text,
      data: res.data as unknown as Prisma.InputJsonValue,
      model: res.model,
      usedFallback: res.usedFallback,
      createdById: user.id,
    },
  });
  await logAudit({ userId: user.id, action: "AI_SUGGEST_CRITERIA", entityType: "Evidence", entityId: evidenceId });
  return { text: res.text, usedFallback: res.usedFallback, suggestions: res.data };
}

export async function linkCriterionAction(evidenceId: string, criterionId: string, suggestedByAi = false): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "evidence:write")) return;
  if ((await prisma.evidence.findUnique({ where: { id: evidenceId }, select: { locked: true } }))?.locked) return;
  await prisma.evidenceCriterionLink.upsert({
    where: { evidenceId_criterionId: { evidenceId, criterionId } },
    update: {},
    create: { evidenceId, criterionId, suggestedByAi },
  });
  await logAudit({ userId: user.id, action: "LINK_CRITERION", entityType: "Evidence", entityId: evidenceId, detail: { criterionId } });
  revalidatePath(`/evidence/${evidenceId}`);
}

export async function linkCriterionForm(evidenceId: string, formData: FormData): Promise<void> {
  const criterionId = String(formData.get("criterionId") || "");
  if (criterionId) await linkCriterionAction(evidenceId, criterionId, false);
}

export async function unlinkCriterionAction(evidenceId: string, criterionId: string): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "evidence:write")) return;
  if ((await prisma.evidence.findUnique({ where: { id: evidenceId }, select: { locked: true } }))?.locked) return;
  await prisma.evidenceCriterionLink.deleteMany({ where: { evidenceId, criterionId } });
  revalidatePath(`/evidence/${evidenceId}`);
}

export async function setEvidenceStatusAction(evidenceId: string, status: EvidenceStatus): Promise<void> {
  const user = await requireUser();
  const isApproval = status === EvidenceStatus.APPROVED;
  if (isApproval && !can(user.role, "evidence:approve")) return;
  if (!isApproval && !can(user.role, "evidence:write")) return;
  if ((await prisma.evidence.findUnique({ where: { id: evidenceId }, select: { locked: true } }))?.locked) return;

  const ev = await prisma.evidence.update({
    where: { id: evidenceId },
    data: {
      status,
      approvedById: isApproval ? user.id : undefined,
      approvedAt: isApproval ? new Date() : undefined,
    },
    select: { uploadedById: true, code: true, title: true },
  });
  await logAudit({ userId: user.id, action: isApproval ? "APPROVE" : "UPDATE_STATUS", entityType: "Evidence", entityId: evidenceId, detail: { status } });

  // Notify the uploader when their evidence is approved or needs revision.
  if ((isApproval || status === EvidenceStatus.NEEDS_REVISION) && ev.uploadedById && ev.uploadedById !== user.id) {
    await createNotification({
      userId: ev.uploadedById,
      title: isApproval ? `Minh chứng ${ev.code} đã được duyệt` : `Minh chứng ${ev.code} cần bổ sung`,
      message: ev.title,
      link: `/evidence/${evidenceId}`,
    });
  }
  revalidatePath(`/evidence/${evidenceId}`);
}
