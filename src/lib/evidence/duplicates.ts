// Duplicate detection for evidence:
//   - exact: same file checksum (SHA-256) within a program
//   - content: near-identical extracted text (mean chunk-embedding cosine >= threshold)
import { prisma } from "../db";
import { cosineSimilarity } from "../ai/embeddings";

export const CONTENT_DUP_THRESHOLD = 0.95;

export interface DuplicateHit {
  id: string;
  code: string;
  title: string;
  kind: "checksum" | "content";
  similarity: number;
}

export async function findChecksumDuplicate(programId: string, checksum: string, excludeId?: string) {
  return prisma.evidence.findFirst({
    where: { programId, checksum, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, code: true, title: true },
  });
}

function meanVector(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

/** Map evidenceId -> duplicates (both kinds) for every evidence item in a program. */
export async function findProgramDuplicates(programId: string): Promise<Map<string, DuplicateHit[]>> {
  const rows = await prisma.evidence.findMany({
    where: { programId },
    select: {
      id: true,
      code: true,
      title: true,
      checksum: true,
      document: { select: { chunks: { select: { embedding: true } } } },
    },
  });
  const result = new Map<string, DuplicateHit[]>();
  const push = (id: string, hit: DuplicateHit) => {
    const arr = result.get(id) ?? [];
    if (!arr.some((h) => h.id === hit.id)) arr.push(hit);
    result.set(id, arr);
  };

  const vecs = rows.map((r) => ({ r, v: meanVector((r.document?.chunks ?? []).map((c) => c.embedding).filter((e) => e.length > 0)) }));
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.checksum && a.checksum === b.checksum) {
        push(a.id, { id: b.id, code: b.code, title: b.title, kind: "checksum", similarity: 1 });
        push(b.id, { id: a.id, code: a.code, title: a.title, kind: "checksum", similarity: 1 });
        continue;
      }
      const va = vecs[i].v;
      const vb = vecs[j].v;
      if (va && vb) {
        const sim = cosineSimilarity(va, vb);
        if (sim >= CONTENT_DUP_THRESHOLD) {
          push(a.id, { id: b.id, code: b.code, title: b.title, kind: "content", similarity: sim });
          push(b.id, { id: a.id, code: a.code, title: a.title, kind: "content", similarity: sim });
        }
      }
    }
  }
  return result;
}
