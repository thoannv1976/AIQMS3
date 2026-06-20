"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { Role } from "@/generated/prisma/enums";

export interface FormState {
  error?: string;
  ok?: boolean;
}

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  if (!can(actor.role, "admin:users")) return { error: "Bạn không có quyền quản trị người dùng." };

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") || "").trim();
  const role = String(formData.get("role") || "LECTURER") as Role;
  const title = String(formData.get("title") || "").trim() || null;
  const password = String(formData.get("password") || "").trim() || "Aiqms@123";

  if (!email || !email.includes("@") || !fullName) return { error: "Vui lòng nhập email và họ tên hợp lệ." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Email đã tồn tại." };

  const passwordHash = await hashPassword(password);
  const created = await prisma.user.create({ data: { email, fullName, role, title, unit: title, passwordHash } });
  await logAudit({ userId: actor.id, action: "CREATE", entityType: "User", entityId: created.id, detail: { email, role } });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function assignProgramRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  if (!can(actor.role, "admin:users")) return { error: "Bạn không có quyền quản trị người dùng." };

  const userId = String(formData.get("userId") || "");
  const programId = String(formData.get("programId") || "");
  const role = String(formData.get("role") || "") as Role;
  if (!userId || !programId || !role) return { error: "Chọn đủ người dùng, chương trình và vai trò." };

  await prisma.userProgramRole.upsert({
    where: { userId_programId_role: { userId, programId, role } },
    update: {},
    create: { userId, programId, role },
  });
  await logAudit({
    userId: actor.id,
    action: "ASSIGN_PROGRAM_ROLE",
    entityType: "UserProgramRole",
    entityId: userId,
    detail: { programId, role },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function removeProgramRoleAction(id: string): Promise<void> {
  const actor = await requireUser();
  if (!can(actor.role, "admin:users")) return;
  await prisma.userProgramRole.deleteMany({ where: { id } });
  await logAudit({ userId: actor.id, action: "REMOVE_PROGRAM_ROLE", entityType: "UserProgramRole", entityId: id });
  revalidatePath("/admin/users");
}

export async function toggleUserActiveAction(userId: string): Promise<void> {
  const actor = await requireUser();
  if (!can(actor.role, "admin:users")) return;
  if (actor.id === userId) return; // don't lock yourself out
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return;
  await prisma.user.update({ where: { id: userId }, data: { isActive: !u.isActive } });
  await logAudit({ userId: actor.id, action: "UPDATE", entityType: "User", entityId: userId, detail: { isActive: !u.isActive } });
  revalidatePath("/admin/users");
}
