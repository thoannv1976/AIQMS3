// Data-level access rules shared by pages, server actions and the AI/RAG layer.
//   - Program scope: institution-wide roles see every program; others only assigned ones.
//   - Evidence confidentiality: who may see Mật / Hạn chế evidence (and its RAG chunks).
//   - External reviewers: read-only, only approved evidence, never "Hạn chế".
import { prisma } from "./db";
import { isInstitutionWide } from "./rbac";
import { Confidentiality, EvidenceStatus, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "./auth";

export const APPROVED_LIKE: EvidenceStatus[] = [EvidenceStatus.APPROVED, EvidenceStatus.USED_IN_REPORT];

type MinimalUser = Pick<SessionUser, "id" | "role">;

/** Program ids the user may access, or null = all programs. */
export async function allowedProgramIds(user: MinimalUser): Promise<string[] | null> {
  if (isInstitutionWide(user.role)) return null;
  const rows = await prisma.userProgramRole.findMany({ where: { userId: user.id }, select: { programId: true } });
  if (rows.length > 0) return [...new Set(rows.map((r) => r.programId))];
  return user.role === Role.EXTERNAL_REVIEWER ? [] : null;
}

export async function canAccessProgram(user: MinimalUser, programId: string): Promise<boolean> {
  const ids = await allowedProgramIds(user);
  return ids === null || ids.includes(programId);
}

/** Confidentiality levels a user may read within a given program. */
export async function allowedConfidentiality(user: MinimalUser, programId: string): Promise<Confidentiality[]> {
  const base: Confidentiality[] = [Confidentiality.PUBLIC, Confidentiality.INTERNAL];
  if (user.role === Role.ADMIN || user.role === Role.QA_OFFICE) {
    return [...base, Confidentiality.CONFIDENTIAL, Confidentiality.RESTRICTED];
  }
  if (user.role === Role.BOARD) return [...base, Confidentiality.CONFIDENTIAL];
  const hasProgramRole = (await prisma.userProgramRole.count({ where: { userId: user.id, programId } })) > 0;
  return hasProgramRole ? [...base, Confidentiality.CONFIDENTIAL] : base;
}

/** Prisma filter for evidence the user may see in a program. */
export async function evidenceVisibilityWhere(user: MinimalUser, programId: string): Promise<Prisma.EvidenceWhereInput> {
  const levels = await allowedConfidentiality(user, programId);
  const where: Prisma.EvidenceWhereInput = { programId, confidentiality: { in: levels } };
  if (user.role === Role.EXTERNAL_REVIEWER) where.status = { in: APPROVED_LIKE };
  return where;
}

/** Whether a single evidence row is visible to the user. */
export async function canSeeEvidence(
  user: MinimalUser,
  ev: { programId: string; confidentiality: Confidentiality; status: EvidenceStatus },
): Promise<boolean> {
  if (!(await canAccessProgram(user, ev.programId))) return false;
  const levels = await allowedConfidentiality(user, ev.programId);
  if (!levels.includes(ev.confidentiality)) return false;
  if (user.role === Role.EXTERNAL_REVIEWER && !APPROVED_LIKE.includes(ev.status)) return false;
  return true;
}

/** Evidence validity helpers (ngày hiệu lực). */
export const EXPIRING_DAYS = 60;
export function validityState(validUntil: Date | null | undefined, now = new Date()): "none" | "valid" | "expiring" | "expired" {
  if (!validUntil) return "none";
  const ms = validUntil.getTime() - now.getTime();
  if (ms < 0) return "expired";
  if (ms <= EXPIRING_DAYS * 86400000) return "expiring";
  return "valid";
}
