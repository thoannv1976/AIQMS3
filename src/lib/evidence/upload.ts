// Shared evidence-creation pipeline used by the single and the bulk upload actions.
import crypto from "node:crypto";
import { after } from "next/server";
import { prisma } from "../db";
import { logAudit } from "../audit";
import { saveFile, buildEvidencePath } from "../storage";
import { processEvidenceDocument, markDocumentProcessing, markDocumentFailed } from "../ai/documents";
import { findChecksumDuplicate } from "./duplicates";
import { queueEvidenceCheck } from "./check";
import { EvidenceStatus, Confidentiality } from "@/generated/prisma/enums";

export const ACCEPTED_EXTENSIONS = ".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";

export interface CreateEvidenceInput {
  userId: string;
  userUnit?: string | null;
  programId: string;
  code: string;
  title: string;
  description?: string | null;
  providerUnit?: string | null;
  confidentiality?: Confidentiality;
  criterionId?: string | null;
  suggestedByAi?: boolean;
  issuedAt?: Date | null;
  validUntil?: Date | null;
  file?: File | null;
  /** Upload even if an identical file already exists in the program. */
  force?: boolean;
}

export type CreateEvidenceResult =
  | { ok: true; id: string }
  | { ok: false; error: string; duplicate?: { id: string; code: string; title: string } };

export function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Queue text extraction / OCR / RAG indexing after the response is sent. */
export function scheduleProcessing(job: { evidenceId: string; programId: string; buffer: Buffer; fileName: string; fileType?: string }) {
  after(async () => {
    try {
      const { text } = await processEvidenceDocument(job);
      // AI quality check (relevance to criteria, outdated document) – never blocks the upload.
      await queueEvidenceCheck(job.evidenceId, text);
    } catch (e) {
      console.error("[evidence] background processing failed:", e);
      await markDocumentFailed(job.evidenceId);
    }
  });
}

export async function createEvidence(input: CreateEvidenceInput): Promise<CreateEvidenceResult> {
  const code = input.code.trim();
  const title = input.title.trim();
  if (!code || !title) return { ok: false, error: "Thiếu mã hoặc tên minh chứng." };

  const program = await prisma.program.findUnique({ where: { id: input.programId } });
  if (!program) return { ok: false, error: "Chương trình không tồn tại." };

  const dup = await prisma.evidence.findUnique({ where: { programId_code: { programId: input.programId, code } } });
  if (dup) return { ok: false, error: `Mã minh chứng "${code}" đã tồn tại trong chương trình.` };

  const file = input.file && input.file.size > 0 ? input.file : null;
  let buffer: Buffer | null = null;
  let checksum: string | null = null;
  if (file) {
    buffer = Buffer.from(await file.arrayBuffer());
    checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    if (!input.force) {
      const same = await findChecksumDuplicate(input.programId, checksum);
      if (same) {
        return {
          ok: false,
          error: `Tệp trùng nội dung với minh chứng ${same.code} — ${same.title}.`,
          duplicate: same,
        };
      }
    }
  }

  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId: input.programId },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });

  let storagePath: string | null = null;
  if (file && buffer) {
    const rel = buildEvidencePath({
      programCode: program.code,
      year: cycle?.year ?? new Date().getFullYear(),
      criterionCode: null,
      fileName: file.name,
    });
    const stored = await saveFile(rel, buffer, file.type || undefined);
    storagePath = stored.storagePath;
    checksum = stored.checksum;
  }

  const evidence = await prisma.evidence.create({
    data: {
      programId: input.programId,
      cycleId: cycle?.id ?? null,
      code,
      title,
      description: input.description ?? null,
      providerUnit: input.providerUnit || input.userUnit || null,
      confidentiality: input.confidentiality ?? Confidentiality.INTERNAL,
      fileName: file?.name ?? null,
      fileType: file?.type || null,
      fileSize: file?.size ?? null,
      storagePath,
      checksum,
      issuedAt: input.issuedAt ?? null,
      validUntil: input.validUntil ?? null,
      status: EvidenceStatus.UPLOADED,
      uploadedById: input.userId,
      criterionLinks: input.criterionId ? { create: [{ criterionId: input.criterionId, suggestedByAi: Boolean(input.suggestedByAi) }] } : undefined,
    },
  });

  await logAudit({ userId: input.userId, action: "UPLOAD", entityType: "Evidence", entityId: evidence.id, detail: { code, forced: Boolean(input.force) } });

  if (buffer && file) {
    await markDocumentProcessing({ evidenceId: evidence.id, programId: input.programId, fileName: file.name, fileType: file.type || null });
    scheduleProcessing({ evidenceId: evidence.id, programId: input.programId, buffer, fileName: file.name, fileType: file.type || undefined });
  }
  return { ok: true, id: evidence.id };
}
