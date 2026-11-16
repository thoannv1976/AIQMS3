import { canInProgram, type Capability } from "./rbac";
import { programRolesOf } from "./program-context";
import type { Role } from "@/generated/prisma/enums";

/** Who may edit a program's key facts: anyone who writes the SAR, the program or its outcomes. */
export async function canEditFacts(userId: string, role: Role, programId: string): Promise<boolean> {
  const roles = await programRolesOf(userId, programId);
  return (["report:write", "program:write", "outcome:write"] as Capability[]).some((c) => canInProgram(role, roles, c));
}
