"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditFacts } from "@/lib/facts";
import { canAccessProgram, APPROVED_LIKE } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { suggestProgramFacts, checkProgramFacts, ragRetrieve, type FactSuggestion } from "@/lib/ai/features";
import { programFactLines } from "@/lib/sar/excerpts";


async function guard(programId: string) {
  const user = await requireUser();
  if (!(await canAccessProgram(user, programId)) || !(await canEditFacts(user.id, user.role, programId))) throw new Error("Không có quyền.");
  return user;
}

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

export async function saveFactAction(programId: string, factId: string | null, fd: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await guard(programId);
    const label = field(fd, "label");
    const value = field(fd, "value");
    if (!label || !value) return { ok: false, error: "Cần tên số liệu và giá trị." };
    const data = { label, value, groupName: field(fd, "groupName"), unit: field(fd, "unit"), period: field(fd, "period"), sourceCode: field(fd, "sourceCode")?.toUpperCase() ?? null, note: field(fd, "note") };
    if (factId) await prisma.programFact.updateMany({ where: { id: factId, programId }, data });
    else {
      const order = await prisma.programFact.count({ where: { programId } });
      await prisma.programFact.create({ data: { ...data, programId, order } });
    }
    await logAudit({ userId: user.id, action: factId ? "UPDATE" : "CREATE", entityType: "ProgramFact", entityId: factId, detail: { programId, label, value } });
    revalidatePath(`/programs/${programId}/facts`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi" };
  }
}

export async function deleteFactAction(programId: string, factId: string): Promise<void> {
  const user = await guard(programId);
  await prisma.programFact.deleteMany({ where: { id: factId, programId } });
  await logAudit({ userId: user.id, action: "DELETE", entityType: "ProgramFact", entityId: factId, detail: { programId } });
  revalidatePath(`/programs/${programId}/facts`);
}

/** Passages of approved evidence that carry the most figures (for AI fact proposals). */
async function numericPassages(programId: string, limit = 45): Promise<string[]> {
  const docs = await prisma.document.findMany({
    where: { evidence: { programId, status: { in: APPROVED_LIKE } } },
    select: { evidence: { select: { code: true } }, chunks: { select: { content: true } } },
  });
  const scored = docs.flatMap((d) =>
    d.chunks.map((c) => ({ code: d.evidence?.code ?? "?", text: c.content.replace(/\s+/g, " ").trim(), score: (c.content.match(/\d/g)?.length ?? 0) / Math.max(1, c.content.length) })),
  );
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((p) => `[${p.code}] ${p.text}`);
}

export async function suggestFactsAction(programId: string): Promise<{ items: FactSuggestion[]; usedFallback: boolean; error?: string }> {
  try {
    const user = await guard(programId);
    const program = await prisma.program.findUniqueOrThrow({ where: { id: programId }, select: { nameVi: true } });
    const existing = (await prisma.programFact.findMany({ where: { programId }, select: { label: true } })).map((f) => f.label);
    return await suggestProgramFacts(program.nameVi, await numericPassages(programId), existing, { userId: user.id });
  } catch (e) {
    return { items: [], usedFallback: true, error: e instanceof Error ? e.message : "Lỗi" };
  }
}

export async function acceptFactsAction(programId: string, items: FactSuggestion[]): Promise<{ added: number }> {
  const user = await guard(programId);
  let order = await prisma.programFact.count({ where: { programId } });
  for (const x of items.slice(0, 40)) {
    if (!x.label?.trim() || !x.value?.trim()) continue;
    await prisma.programFact.create({
      data: { programId, order: order++, label: x.label.trim(), value: x.value.trim(), groupName: x.groupName || null, unit: x.unit || null, period: x.period || null, sourceCode: x.sourceCode?.toUpperCase() || null, note: "Đề xuất bởi AI từ minh chứng" },
    });
  }
  await logAudit({ userId: user.id, action: "AI_FACTS_ACCEPT", entityType: "ProgramFact", entityId: null, detail: { programId, count: items.length } });
  revalidatePath(`/programs/${programId}/facts`);
  return { added: items.length };
}

export async function checkFactsAction(programId: string): Promise<{ text: string; usedFallback: boolean }> {
  const user = await guard(programId);
  const program = await prisma.program.findUniqueOrThrow({ where: { id: programId }, select: { nameVi: true } });
  const facts = await prisma.programFact.findMany({ where: { programId }, orderBy: { order: "asc" }, take: 40 });
  if (!facts.length) return { text: "Chưa có số liệu chính để đối chiếu.", usedFallback: true };
  const seen = new Set<string>();
  const passages: string[] = [];
  for (const f of facts) {
    const hits = await ragRetrieve(programId, `${f.label} ${f.value} ${f.period ?? ""}`, 3, { statuses: APPROVED_LIKE });
    for (const h of hits) {
      const key = h.content.slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      passages.push(`[${h.evidenceCode ?? "?"}] ${h.content.replace(/\s+/g, " ").trim()}`);
    }
  }
  const res = await checkProgramFacts(program.nameVi, await programFactLines(programId), passages, { userId: user.id });
  await logAudit({ userId: user.id, action: "AI_FACTS_CHECK", entityType: "ProgramFact", entityId: null, detail: { programId, facts: facts.length } });
  return { text: res.text, usedFallback: res.usedFallback };
}
