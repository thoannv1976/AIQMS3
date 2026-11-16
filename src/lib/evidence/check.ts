// Run the AI quality check for one evidence and store the result on the row.
import { prisma } from "@/lib/db";
import { assessEvidence, type EvidenceCheck } from "@/lib/ai/features";
import type { Prisma } from "@/generated/prisma/client";

export async function runEvidenceCheck(evidenceId: string, opts: { userId?: string | null; text?: string } = {}): Promise<EvidenceCheck | null> {
  const ev = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    select: {
      code: true, title: true, issuedAt: true,
      program: { select: { nameVi: true } },
      document: { select: { extractedText: true } },
      criterionLinks: { select: { criterion: { select: { code: true, title: true } } } },
    },
  });
  if (!ev) return null;
  const check = await assessEvidence(
    {
      code: ev.code,
      title: ev.title,
      text: opts.text ?? ev.document?.extractedText ?? "",
      criteria: ev.criterionLinks.map((l) => l.criterion),
      programName: ev.program.nameVi,
      issuedAt: ev.issuedAt,
    },
    { userId: opts.userId },
  );
  await prisma.evidence.update({ where: { id: evidenceId }, data: { aiCheck: check as unknown as Prisma.InputJsonValue, aiCheckedAt: new Date() } });
  return check;
}

/** Short label for a stored check, or null when nothing needs attention. */
export function checkFlag(raw: unknown): { label: string; color: "red" | "amber"; notes: string[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<EvidenceCheck>;
  const notes = Array.isArray(c.notes) ? c.notes : [];
  if (c.relevance === "low" && c.outdated) return { label: "AI: lạc đề & có thể hết hiệu lực", color: "red", notes };
  if (c.relevance === "low") return { label: "AI: có thể không liên quan tiêu chí", color: "red", notes };
  if (c.outdated) return { label: "AI: văn bản có thể cũ/hết hiệu lực", color: "amber", notes };
  if (c.relevance === "partial") return { label: "AI: liên quan một phần", color: "amber", notes };
  return null;
}

// At most 3 checks at a time per instance, so a 50-file bulk upload does not burst the AI API.
let active = 0;
const waiting: Array<() => void> = [];
export async function queueEvidenceCheck(evidenceId: string, text?: string): Promise<void> {
  if (active >= 3) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    await runEvidenceCheck(evidenceId, { text });
  } catch (e) {
    console.error("[evidence] AI check failed:", e);
  } finally {
    active--;
    waiting.shift()?.();
  }
}
