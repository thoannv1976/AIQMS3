import { prisma } from "@/lib/db";

/**
 * Criteria covered by a SAR section: a standard-level section (standardId set) covers
 * every criterion of that standard; a criterion-level section covers just its criterion.
 */
export async function sectionCriterionIds(section: { standardId: string | null; criterionId: string | null }): Promise<string[]> {
  if (section.standardId) {
    const rows = await prisma.criterion.findMany({ where: { standardId: section.standardId }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  return section.criterionId ? [section.criterionId] : [];
}
