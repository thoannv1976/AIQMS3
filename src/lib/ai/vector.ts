// Optional pgvector acceleration for RAG retrieval. Activated with RAG_DRIVER=pgvector
// on a database where the `vector` extension is available (e.g. Cloud SQL for
// PostgreSQL). The embedding is also kept as Float[] (DocumentChunk.embedding) so the
// in-app cosine path keeps working everywhere — pgvector is a drop-in accelerator.
//
// The `embedding_vec` column is managed out-of-band (not in the Prisma schema) so
// environments without pgvector are never blocked. Run `npm run rag:pgvector` to set
// it up + backfill on a pgvector-enabled database.

import { prisma } from "../db";
import { EMBEDDING_DIM } from "./embeddings";

export interface SimilarChunk {
  content: string;
  evidenceId: string | null;
  evidenceCode: string | null;
  evidenceTitle: string | null;
  score: number;
}

export function pgVectorEnabled(): boolean {
  return process.env.RAG_DRIVER === "pgvector";
}

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Idempotent: create the extension, the vector column and an ANN index. */
export async function ensurePgVectorSchema(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS embedding_vec vector(${EMBEDDING_DIM})`,
  );
  // Prefer HNSW (pgvector ≥ 0.5); fall back to IVFFlat; tolerate neither (sequential scan).
  try {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS documentchunk_embedding_vec_idx ON "DocumentChunk" USING hnsw (embedding_vec vector_cosine_ops)`,
    );
  } catch {
    try {
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS documentchunk_embedding_vec_idx ON "DocumentChunk" USING ivfflat (embedding_vec vector_cosine_ops) WITH (lists = 100)`,
      );
    } catch (err) {
      console.warn("[pgvector] could not create ANN index (search still works, slower):", err);
    }
  }
}

/** Backfill embedding_vec from the existing Float[] embeddings. Returns rows updated. */
export async function backfillVectors(): Promise<number> {
  return prisma.$executeRawUnsafe(
    `UPDATE "DocumentChunk" SET embedding_vec = embedding::vector
     WHERE embedding_vec IS NULL AND array_length(embedding, 1) = ${EMBEDDING_DIM}`,
  );
}

/** Sync vectors for a single document's chunks (called after (re)processing). */
export async function indexDocumentVectors(documentId: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "DocumentChunk" SET embedding_vec = embedding::vector
    WHERE "documentId" = ${documentId} AND array_length(embedding, 1) = ${EMBEDDING_DIM}`;
}

/** Approximate nearest-neighbour search in the database (cosine distance). */
export async function searchSimilar(programId: string, queryVec: number[], k: number): Promise<SimilarChunk[]> {
  const lit = toVectorLiteral(queryVec);
  const rows = await prisma.$queryRaw<
    Array<{ content: string; evidenceId: string | null; evidenceCode: string | null; evidenceTitle: string | null; score: number }>
  >`
    SELECT dc.content AS content,
           e.id AS "evidenceId", e.code AS "evidenceCode", e.title AS "evidenceTitle",
           1 - (dc.embedding_vec <=> ${lit}::vector) AS score
    FROM "DocumentChunk" dc
    JOIN "Document" d ON d.id = dc."documentId"
    LEFT JOIN "Evidence" e ON e.id = d."evidenceId"
    WHERE d."programId" = ${programId} AND dc.embedding_vec IS NOT NULL
    ORDER BY dc.embedding_vec <=> ${lit}::vector
    LIMIT ${k}`;
  return rows.map((r) => ({
    content: r.content,
    evidenceId: r.evidenceId,
    evidenceCode: r.evidenceCode,
    evidenceTitle: r.evidenceTitle,
    score: Number(r.score),
  }));
}
