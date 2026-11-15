"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { allowedProgramIds } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { leadershipBrief } from "@/lib/ai/features";
import { getManagementOverview, overviewToText } from "@/lib/quality/management";
import { AiAnalysisType } from "@/generated/prisma/enums";

/** AI leadership brief for the current dashboard scope (whole school or one faculty). Cached as the latest result. */
export async function leadershipBriefAction(facultyId: string | null): Promise<{ text: string; usedFallback: boolean; createdAt: string }> {
  const user = await requireUser();
  if (!can(user.role, "ai:use")) return { text: "Bạn không có quyền dùng AI.", usedFallback: true, createdAt: new Date().toISOString() };
  const overview = await getManagementOverview({ programIds: await allowedProgramIds(user), facultyId });
  const res = await leadershipBrief(overviewToText(overview), { userId: user.id });
  const row = await prisma.aiAnalysisResult.create({
    data: {
      type: AiAnalysisType.LEADERSHIP_BRIEF,
      targetType: "dashboard",
      targetId: facultyId ?? "all",
      result: res.text,
      model: res.model,
      usedFallback: res.usedFallback,
      createdById: user.id,
    },
  });
  await logAudit({ userId: user.id, action: "AI_LEADERSHIP_BRIEF", entityType: "Dashboard", entityId: facultyId ?? "all" });
  revalidatePath("/dashboard");
  return { text: res.text, usedFallback: res.usedFallback, createdAt: row.createdAt.toISOString() };
}
