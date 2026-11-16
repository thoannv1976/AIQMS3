"use server";

import { prisma } from "@/lib/db";
import { requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export interface PasswordState {
  error?: string;
  ok?: boolean;
}

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser();
  const current = String(formData.get("current") || "");
  const next = String(formData.get("next") || "");
  const confirm = String(formData.get("confirm") || "");

  if (next.length < 8) return { error: "Mật khẩu mới phải có ít nhất 8 ký tự." };
  if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) return { error: "Mật khẩu mới phải có cả chữ và số." };
  if (next !== confirm) return { error: "Xác nhận mật khẩu không khớp." };
  if (next === current) return { error: "Mật khẩu mới phải khác mật khẩu hiện tại." };

  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await verifyPassword(current, row.passwordHash))) return { error: "Mật khẩu hiện tại không đúng." };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await logAudit({ userId: user.id, action: "CHANGE_PASSWORD", entityType: "User", entityId: user.id });
  return { ok: true };
}
