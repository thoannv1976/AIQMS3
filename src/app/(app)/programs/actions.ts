"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { DegreeLevel } from "@/generated/prisma/enums";

export interface FormState {
  error?: string;
}

export async function createProgram(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "program:write")) return { error: "Bạn không có quyền tạo chương trình." };

  const code = String(formData.get("code") || "").trim().toUpperCase();
  const nameVi = String(formData.get("nameVi") || "").trim();
  const facultyId = String(formData.get("facultyId") || "");
  const degreeLevel = String(formData.get("degreeLevel") || "BACHELOR") as DegreeLevel;
  const totalCredits = parseInt(String(formData.get("totalCredits") || "0"), 10) || null;
  const objectives = String(formData.get("objectives") || "").trim() || null;

  if (!code || !nameVi || !facultyId) return { error: "Vui lòng nhập mã, tên chương trình và khoa." };

  const existing = await prisma.program.findUnique({ where: { code } });
  if (existing) return { error: `Mã chương trình "${code}" đã tồn tại.` };

  const program = await prisma.program.create({
    data: { code, nameVi, facultyId, degreeLevel, totalCredits, objectives },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Program", entityId: program.id, detail: { code } });
  revalidatePath("/programs");
  redirect(`/programs/${program.id}`);
}

export async function createProgramVersion(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "program:write")) return { error: "Bạn không có quyền." };

  const programId = String(formData.get("programId") || "");
  const versionLabel = String(formData.get("versionLabel") || "").trim();
  const year = parseInt(String(formData.get("year") || "0"), 10);
  const summary = String(formData.get("summary") || "").trim() || null;
  const changeReason = String(formData.get("changeReason") || "").trim() || null;

  if (!programId || !versionLabel || !year) return { error: "Thiếu thông tin phiên bản." };

  await prisma.programVersion.create({
    data: { programId, versionLabel, year, summary, changeReason, status: "DRAFT" },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "ProgramVersion", entityId: programId });
  revalidatePath(`/programs/${programId}`);
  return {};
}
