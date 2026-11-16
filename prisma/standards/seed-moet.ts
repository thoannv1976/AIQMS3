// Idempotent upsert of the MOET standard sets (TT04/2025 programme-level,
// TT20/2026 institution-level) from moet-standard-sets.json.
// Never deletes anything: existing standards/criteria are updated in place by code.

import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "../../src/generated/prisma/client";

interface CriterionDef { code: string; title: string }
interface StandardDef { code: string; title: string; criteria: CriterionDef[] }
interface SetDef { code: string; name: string; description: string; standards: StandardDef[] }

function orderFromCode(code: string): number {
  return code
    .split(/[.\-]/)
    .map((p) => parseInt(p, 10) || 0)
    .reduce((acc, n, i) => acc + n * Math.pow(100, 2 - i), 0);
}

export async function seedMoetStandardSets(prisma: PrismaClient): Promise<{ sets: number; standards: number; criteria: number }> {
  const file = path.join(process.cwd(), "prisma", "standards", "moet-standard-sets.json");
  const defs = JSON.parse(fs.readFileSync(file, "utf-8")) as SetDef[];
  let standards = 0;
  let criteria = 0;
  for (const def of defs) {
    const set = await prisma.accreditationStandardSet.upsert({
      where: { code: def.code },
      update: { name: def.name, description: def.description },
      create: { code: def.code, name: def.name, description: def.description },
    });
    for (const std of def.standards) {
      const s = await prisma.standard.upsert({
        where: { setId_code: { setId: set.id, code: std.code } },
        update: { title: std.title, order: orderFromCode(std.code) },
        create: { setId: set.id, code: std.code, title: std.title, order: orderFromCode(std.code) },
      });
      standards++;
      for (const c of std.criteria) {
        await prisma.criterion.upsert({
          where: { standardId_code: { standardId: s.id, code: c.code } },
          update: { title: c.title, order: orderFromCode(c.code) },
          create: { standardId: s.id, code: c.code, title: c.title, order: orderFromCode(c.code) },
        });
        criteria++;
      }
    }
  }
  return { sets: defs.length, standards, criteria };
}
