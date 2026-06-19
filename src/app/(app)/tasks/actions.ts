"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { TaskStatus, TaskPriority } from "@/generated/prisma/enums";

export interface FormState {
  error?: string;
}

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "task:write")) return { error: "Bạn không có quyền tạo nhiệm vụ." };

  const programId = String(formData.get("programId") || "") || null;
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const unit = String(formData.get("unit") || "").trim() || null;
  const priority = (String(formData.get("priority") || "MEDIUM") as TaskPriority) || "MEDIUM";
  const criterionId = String(formData.get("criterionId") || "") || null;
  const dueRaw = String(formData.get("dueDate") || "");
  const dueDate = dueRaw ? new Date(dueRaw) : null;

  if (!title) return { error: "Vui lòng nhập tiêu đề nhiệm vụ." };

  const cycle = programId ? await prisma.accreditationCycle.findFirst({ where: { programId }, orderBy: { year: "desc" } }) : null;

  await prisma.task.create({
    data: {
      programId,
      cycleId: cycle?.id ?? null,
      criterionId,
      title,
      description,
      unit,
      priority,
      dueDate,
      status: TaskStatus.TODO,
      assigneeId: user.id,
      createdById: user.id,
    },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Task", detail: { title } });
  revalidatePath("/tasks");
  redirect(`/tasks${programId ? `?program=${programId}` : ""}`);
}

export async function updateTaskStatusAction(taskId: string, status: TaskStatus): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "task:write")) return;
  await prisma.task.update({ where: { id: taskId }, data: { status } });
  await logAudit({ userId: user.id, action: "UPDATE_STATUS", entityType: "Task", entityId: taskId, detail: { status } });
  revalidatePath("/tasks");
}
