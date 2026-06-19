"use server";

import { requireUser } from "@/lib/auth";
import { ragAnswer, type RetrievedChunk } from "@/lib/ai/features";
import { logAudit } from "@/lib/audit";

export interface AskResult {
  text: string;
  usedFallback: boolean;
  citations: RetrievedChunk[];
}

export async function askAction(programId: string, question: string): Promise<AskResult> {
  const user = await requireUser();
  const q = question.trim();
  if (!programId || !q) return { text: "Vui lòng chọn chương trình và nhập câu hỏi.", usedFallback: true, citations: [] };

  const res = await ragAnswer(programId, q);
  await logAudit({ userId: user.id, action: "AI_CHAT", entityType: "Program", entityId: programId, detail: { question: q } });
  return { text: res.text, usedFallback: res.usedFallback, citations: res.citations };
}
