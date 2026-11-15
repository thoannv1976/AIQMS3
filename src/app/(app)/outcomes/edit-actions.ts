"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { programRolesOf } from "@/lib/program-context";
import { canInProgram } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { ContributionLevel } from "@/generated/prisma/enums";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function requireOutcomeWriter(programId: string) {
  const user = await requireUser();
  if (can(user.role, "outcome:write")) return user;
  const roles = await programRolesOf(user.id, programId);
  if (canInProgram(user.role, roles, "outcome:write")) return user;
  return null;
}

function revalidate() {
  revalidatePath("/outcomes");
  revalidatePath("/curriculum-check");
}

export async function createPloAction(programId: string, formData: FormData): Promise<void> {
  const user = await requireOutcomeWriter(programId);
  if (!user) return;
  const code = str(formData, "code").toUpperCase();
  const description = str(formData, "description");
  if (!code || !description) return;
  const dup = await prisma.plo.findUnique({ where: { programId_code: { programId, code } } });
  if (dup) return;
  const plo = await prisma.plo.create({
    data: { programId, code, description, category: str(formData, "category") || null },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Plo", entityId: plo.id, detail: { code } });
  revalidate();
  revalidatePath(`/programs/${programId}`);
}

export async function updatePloAction(ploId: string, formData: FormData): Promise<void> {
  const plo = await prisma.plo.findUnique({ where: { id: ploId } });
  if (!plo) return;
  const user = await requireOutcomeWriter(plo.programId);
  if (!user) return;
  const code = str(formData, "code").toUpperCase();
  const description = str(formData, "description");
  if (!code || !description) return;
  await prisma.plo.update({
    where: { id: ploId },
    data: { code, description, category: str(formData, "category") || null },
  });
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "Plo", entityId: ploId });
  revalidate();
  revalidatePath(`/programs/${plo.programId}`);
}

export async function deletePloAction(ploId: string): Promise<void> {
  const plo = await prisma.plo.findUnique({ where: { id: ploId } });
  if (!plo) return;
  const user = await requireOutcomeWriter(plo.programId);
  if (!user) return;
  await prisma.plo.delete({ where: { id: ploId } });
  await logAudit({ userId: user.id, action: "DELETE", entityType: "Plo", entityId: ploId, detail: { code: plo.code } });
  revalidate();
  revalidatePath(`/programs/${plo.programId}`);
}

/** Set one cell of the course → PLO matrix. Empty level removes the link. */
export async function setMatrixCellAction(courseId: string, ploId: string, formData: FormData): Promise<void> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { programId: true } });
  if (!course) return;
  const user = await requireOutcomeWriter(course.programId);
  if (!user) return;
  const level = str(formData, "level") as ContributionLevel | "";
  if (level && !Object.values(ContributionLevel).includes(level)) return;

  if (!level) {
    await prisma.curriculumMap.deleteMany({ where: { courseId, ploId } });
  } else {
    await prisma.curriculumMap.upsert({
      where: { courseId_ploId: { courseId, ploId } },
      update: { level },
      create: { programId: course.programId, courseId, ploId, level },
    });
  }
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "CurriculumMap", entityId: courseId, detail: { ploId, level: level || null } });
  revalidate();
}
