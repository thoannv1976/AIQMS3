"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, canInProgram } from "@/lib/rbac";
import { programRolesOf } from "@/lib/program-context";
import { logAudit } from "@/lib/audit";
import { saveFile, buildEvidencePath, readFile } from "@/lib/storage";
import { createNotification } from "@/lib/notify";
import { processEvidenceDocument, markDocumentProcessing, markDocumentFailed } from "@/lib/ai/documents";
import { summarizeText, suggestCriteria } from "@/lib/ai/features";
import { EvidenceStatus, AiAnalysisType, Confidentiality } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
}

export async function uploadEvidence(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const programId = String(formData.get("programId") || "");
  const title = String(formData.get("title") || "").trim();
  const code = String(formData.get("code") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const providerUnit = String(formData.get("providerUnit") || "").trim() || user.unit || null;
  const confidentiality = (String(formData.get("confidentiality") || "INTERNAL") as Confidentiality) || "INTERNAL";
  const criterionId = String(formData.get("criterionId") || "") || null;
  const file = formData.get("file") as File | null;

  if (!programId || !title || !code) return { error: "Vui lòng nhập chương trình, mã và tên minh chứng." };

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) return { error: "Chương trình không tồn tại." };

  if (!canInProgram(user.role, await programRolesOf(user.id, programId), "evidence:write")) {
    return { error: "Bạn không có quyền tải minh chứng cho chương trình này." };
  }

  const dup = await prisma.evidence.findUnique({ where: { programId_code: { programId, code } } });
  if (dup) return { error: `Mã minh chứng "${code}" đã tồn tại trong chương trình.` };

  const cycle = await prisma.accreditationCycle.findFirst({ where: { programId }, orderBy: { year: "desc" } });

  let storagePath: string | null = null;
  let checksum: string | null = null;
  let fileName: string | null = null;
  let fileType: string | null = null;
  let fileSize: number | null = null;
  let buffer: Buffer | null = null;

  if (file && file.size > 0) {
    buffer = Buffer.from(await file.arrayBuffer());
    fileName = file.name;
    fileType = file.type || null;
    fileSize = file.size;
    const rel = buildEvidencePath({
      programCode: program.code,
      year: cycle?.year ?? new Date().getFullYear(),
      criterionCode: null,
      fileName: file.name,
    });
    const stored = await saveFile(rel, buffer, fileType ?? undefined);
    storagePath = stored.storagePath;
    checksum = stored.checksum;
  }

  const evidence = await prisma.evidence.create({
    data: {
      programId,
      cycleId: cycle?.id ?? null,
      code,
      title,
      description,
      providerUnit,
      confidentiality,
      fileName,
      fileType,
      fileSize,
      storagePath,
      checksum,
      status: EvidenceStatus.UPLOADED,
      uploadedById: user.id,
      criterionLinks: criterionId ? { create: [{ criterionId }] } : undefined,
    },
  });

  await logAudit({ userId: user.id, action: "UPLOAD", entityType: "Evidence", entityId: evidence.id, detail: { code } });

  // Text extraction + RAG indexing runs in the background (after the response) so the
  // upload returns immediately even for large files. UI shows the processing status.
  if (buffer && fileName) {
    await markDocumentProcessing({ evidenceId: evidence.id, programId, fileName, fileType });
    const job = { evidenceId: evidence.id, programId, buffer, fileName, fileType: fileType ?? undefined };
    after(async () => {
      try {
        await processEvidenceDocument(job);
      } catch (e) {
        console.error("[evidence] background processing failed:", e);
        await markDocumentFailed(job.evidenceId);
      }
    });
  }

  revalidatePath("/evidence");
  redirect(`/evidence/${evidence.id}`);
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

  const cycle =
    evidence.cycle ??
    (await prisma.accreditationCycle.findFirst({
      where: { programId: evidence.programId },
      orderBy: { year: "desc" },
      include: { standardSet: { include: { standards: { include: { criteria: true } } } } },
    }));

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
  await prisma.evidenceCriterionLink.deleteMany({ where: { evidenceId, criterionId } });
  revalidatePath(`/evidence/${evidenceId}`);
}

export async function setEvidenceStatusAction(evidenceId: string, status: EvidenceStatus): Promise<void> {
  const user = await requireUser();
  const isApproval = status === EvidenceStatus.APPROVED;
  if (isApproval && !can(user.role, "evidence:approve")) return;
  if (!isApproval && !can(user.role, "evidence:write")) return;

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
