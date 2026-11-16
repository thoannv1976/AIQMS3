"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !email.includes("@") || !password) {
    return { error: "Vui lòng nhập email và mật khẩu hợp lệ." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return { error: "Tài khoản không tồn tại hoặc đã bị khóa." };
  }

  if (user.expiresAt && user.expiresAt.getTime() < Date.now()) {
    return { error: "Tài khoản đã hết hạn sử dụng. Vui lòng liên hệ quản trị hệ thống." };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { error: "Email hoặc mật khẩu không đúng." };
  }

  await createSession(user.id);
  await logAudit({ userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id });
  redirect("/dashboard");
}
