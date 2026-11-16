// One-off setup for pgvector-accelerated RAG. Run on a database where the `vector`
// extension is available (e.g. Cloud SQL for PostgreSQL):
//
//   RAG_DRIVER=pgvector npm run rag:pgvector
//
// Creates the extension + embedding_vec column + ANN index and backfills vectors
// from the existing Float[] embeddings. Safe to re-run (idempotent).

import path from "node:path";
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* env injected directly */
}

async function main() {
  const { ensurePgVectorSchema, backfillVectors } = await import("@/lib/ai/vector");
  const { prisma } = await import("@/lib/db");

  if (process.env.RAG_DRIVER !== "pgvector") {
    console.warn("⚠️  RAG_DRIVER is not 'pgvector'. Schema will be set up, but set RAG_DRIVER=pgvector to use it at runtime.");
  }

  console.log("→ Ensuring pgvector extension, column and ANN index…");
  await ensurePgVectorSchema();
  console.log("→ Backfilling vectors from existing embeddings…");
  const n = await backfillVectors();
  console.log(`✅ pgvector ready. Backfilled ${n} chunk vector(s).`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("pgvector setup failed:", e);
  process.exit(1);
});
