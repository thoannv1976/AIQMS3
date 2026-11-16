// Add/refresh the MOET standard sets (TT04/2025, TT20/2026) WITHOUT wiping data.
// Safe to run on production:   npm run db:standards
import path from "node:path";
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* env injected directly */
}

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedMoetStandardSets } from "../prisma/standards/seed-moet";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

seedMoetStandardSets(prisma)
  .then((r) => console.log(`✅ Standard sets upserted: ${r.sets} sets, ${r.standards} standards, ${r.criteria} criteria.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
