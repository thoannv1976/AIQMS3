"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ragAnswer, type RetrievedChunk } from "@/lib/ai/features";
import { logAudit } from "@/lib/audit";

export interface AskResult {
  text: string;
  usedFallback: boolean;
  citations: RetrievedChunk[];
  sessionId: string;
}

export async function askAction(programId: string, question: string, sessionId?: string): Promise<AskResult> {
  const user = await requireUser();
  const q = question.trim();
  if (!programId || !q) {
    return { text: "Vui lòng chọn chương trình và nhập câu hỏi.", usedFallback: true, citations: [], sessionId: sessionId ?? "" };
  }

  const res = await ragAnswer(programId, q, { userId: user.id });

  // Persist the conversation (create the session on the first question).
  let sid = sessionId;
  if (sid) {
    const owned = await prisma.aiChatSession.findFirst({ where: { id: sid, userId: user.id }, select: { id: true } });
    if (!owned) sid = undefined;
  }
  if (!sid) {
    const session = await prisma.aiChatSession.create({
      data: { userId: user.id, programId, title: q.length > 80 ? q.slice(0, 80) + "…" : q },
    });
    sid = session.id;
  }
  await prisma.aiChatMessage.createMany({
    data: [
      { sessionId: sid, role: "user", content: q },
      { sessionId: sid, role: "assistant", content: res.text, citations: res.citations as unknown as object },
    ],
  });

  await logAudit({ userId: user.id, action: "AI_CHAT", entityType: "Program", entityId: programId, detail: { question: q } });
  revalidatePath("/ai-assistant");
  return { text: res.text, usedFallback: res.usedFallback, citations: res.citations, sessionId: sid };
}

export async function deleteChatSessionAction(sessionId: string): Promise<void> {
  const user = await requireUser();
  await prisma.aiChatSession.deleteMany({ where: { id: sessionId, userId: user.id } });
  revalidatePath("/ai-assistant");
}
