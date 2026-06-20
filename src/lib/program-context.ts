import { prisma } from "./db";
import { getCurrentUser } from "./auth";
import { isInstitutionWide } from "./rbac";

export interface ProgramLite {
  id: string;
  code: string;
  nameVi: string;
}

/**
 * Resolve the active program from ?program=<id>, scoped to what the current user may
 * access. Institution-wide roles see every program; others see only the programs they
 * are assigned to via UserProgramRole. Users with no assignment fall back to all
 * programs (program scoping is opt-in per user).
 */
export async function resolveProgram(
  programId?: string,
): Promise<{ programs: ProgramLite[]; selected: ProgramLite | null }> {
  const user = await getCurrentUser();

  let programIds: string[] | null = null;
  if (user && !isInstitutionWide(user.role)) {
    const assigned = await prisma.userProgramRole.findMany({
      where: { userId: user.id },
      select: { programId: true },
    });
    if (assigned.length > 0) programIds = [...new Set(assigned.map((a) => a.programId))];
  }

  const programs = await prisma.program.findMany({
    where: programIds ? { id: { in: programIds } } : undefined,
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, nameVi: true },
  });
  const selected = programs.find((p) => p.id === programId) ?? programs[0] ?? null;
  return { programs, selected };
}

/** Roles the user holds within a specific program (for capability elevation). */
export async function programRolesOf(userId: string, programId: string) {
  const rows = await prisma.userProgramRole.findMany({
    where: { userId, programId },
    select: { role: true },
  });
  return rows.map((r) => r.role);
}
