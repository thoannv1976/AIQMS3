import { prisma } from "./db";

export interface ProgramLite {
  id: string;
  code: string;
  nameVi: string;
}

/** Resolve the active program from ?program=<id>, defaulting to the first program. */
export async function resolveProgram(
  programId?: string,
): Promise<{ programs: ProgramLite[]; selected: ProgramLite | null }> {
  const programs = await prisma.program.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, nameVi: true },
  });
  const selected = programs.find((p) => p.id === programId) ?? programs[0] ?? null;
  return { programs, selected };
}
