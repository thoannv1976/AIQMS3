// Evidence context for AI SAR drafting: instead of one-paragraph summaries, give the model
// the most relevant full-text passages of each approved evidence (with numbers preferred),
// plus the program's confirmed key facts. Purely local ranking — no extra AI calls.
import { prisma } from "@/lib/db";
import { embedText, cosineSimilarity } from "@/lib/ai/embeddings";
import { formatDate } from "@/lib/utils";

const TOTAL_BUDGET = 18_000; // characters of excerpts per section (~6k tokens)
const MAX_PER_EVIDENCE = 3_000;
const MIN_PER_EVIDENCE = 900;

const squash = (s: string) => s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
/** Share of characters that are digits/percent signs – passages with figures rank higher. */
const numericDensity = (s: string) => (s.match(/[\d%]/g)?.length ?? 0) / Math.max(1, s.length);

export interface EvidenceLite {
  id: string;
  code: string;
  title: string;
  providerUnit: string | null;
  issuedAt: Date | null;
  description: string | null;
}

/** Build one prompt block per evidence: header, AI summary, then ranked full-text excerpts. */
export async function evidenceContextBlocks(evidence: EvidenceLite[], query: string): Promise<string[]> {
  if (!evidence.length) return [];
  const docs = await prisma.document.findMany({
    where: { evidenceId: { in: evidence.map((e) => e.id) } },
    select: { evidenceId: true, summary: true, extractedText: true, chunks: { select: { chunkIndex: true, content: true, embedding: true }, orderBy: { chunkIndex: "asc" } } },
  });
  const byEv = new Map(docs.map((d) => [d.evidenceId, d]));
  const per = Math.max(MIN_PER_EVIDENCE, Math.min(MAX_PER_EVIDENCE, Math.floor(TOTAL_BUDGET / evidence.length)));
  const q = embedText(query);

  return evidence.map((e) => {
    const d = byEv.get(e.id);
    const meta = [e.providerUnit, e.issuedAt ? `ban hành ${formatDate(e.issuedAt)}` : null].filter(Boolean).join(", ");
    const head = `#### [${e.code}] ${e.title}${meta ? ` (${meta})` : ""}`;
    const summary = d?.summary || e.description || "";
    const full = squash(d?.extractedText ?? "");
    let excerpt = "";
    if (full.length <= per) excerpt = full;
    else if (d?.chunks.length) {
      const ranked = d.chunks
        .map((c) => ({ c, score: cosineSimilarity(q, c.embedding) + 3 * numericDensity(c.content) }))
        .sort((a, b) => b.score - a.score);
      const picked: typeof d.chunks = [];
      let used = 0;
      for (const { c } of ranked) {
        if (used + c.content.length > per && picked.length) continue;
        picked.push(c);
        used += c.content.length;
        if (used >= per) break;
      }
      excerpt = picked
        .sort((a, b) => a.chunkIndex - b.chunkIndex)
        .map((c) => squash(c.content).slice(0, per))
        .join("\n[…]\n");
    } else excerpt = full.slice(0, per);
    return [head, summary ? `Tóm tắt: ${squash(summary)}` : "", excerpt ? `Trích đoạn nguyên văn:\n${excerpt}` : "(Chưa trích xuất được nội dung tệp.)"].filter(Boolean).join("\n");
  });
}

/** The program's key facts as prompt lines (empty when none were entered). */
export async function programFactLines(programId: string): Promise<string[]> {
  const facts = await prisma.programFact.findMany({ where: { programId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  return facts.map((f) => {
    const val = [f.value, f.unit].filter(Boolean).join(" ");
    const extra = [f.period ? `kỳ: ${f.period}` : null, f.sourceCode ? `[${f.sourceCode}]` : null].filter(Boolean).join(" ");
    return `- ${f.groupName ? `${f.groupName} – ` : ""}${f.label}: ${val}${extra ? ` (${extra})` : ""}`;
  });
}
