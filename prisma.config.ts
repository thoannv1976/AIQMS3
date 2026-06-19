import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 + config file no longer auto-loads .env; load it explicitly (Node 22).
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env is optional (e.g. in CI where env vars are injected directly)
}

// Prisma 7 moved the connection URL out of schema.prisma.
// The CLI (migrate / introspect) reads it from here; the runtime client
// uses a driver adapter (see src/lib/db.ts).
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
