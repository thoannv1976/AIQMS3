"use server";

import { redirect } from "next/navigation";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await logAudit({ userId: user.id, action: "LOGOUT", entityType: "User", entityId: user.id });
  }
  await destroySession();
  redirect("/login");
}
