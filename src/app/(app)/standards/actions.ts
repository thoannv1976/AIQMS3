"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const nullable = (fd: FormData, k: string) => str(fd, k) || null;

async function requireWriter() {
  const user = await requireUser();
  if (!can(user.role, "standard:write")) throw new Error("Bạn không có quyền cấu hình bộ tiêu chuẩn.");
  return user;
}

/** Sort key so "1.10" comes after "1.9" and "10" after "9". */
function orderFromCode(code: string): number {
  return code
    .split(/[.\-]/)
    .map((p) => parseInt(p, 10) || 0)
    .reduce((acc, n, i) => acc + n * Math.pow(100, 2 - i), 0);
}

export async function createStandardSetAction(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const code = str(formData, "code").toUpperCase().replace(/\s+/g, "_");
  const name = str(formData, "name");
  if (!code || !name) return;
  const exists = await prisma.accreditationStandardSet.findUnique({ where: { code } });
  if (exists) redirect(`/standards/${exists.id}`);
  const set = await prisma.accreditationStandardSet.create({
    data: { code, name, description: nullable(formData, "description") },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "AccreditationStandardSet", entityId: set.id, detail: { code } });
  revalidatePath("/standards");
  redirect(`/standards/${set.id}`);
}

export async function updateStandardSetAction(setId: string, formData: FormData): Promise<void> {
  const user = await requireWriter();
  const name = str(formData, "name");
  if (!name) return;
  await prisma.accreditationStandardSet.update({
    where: { id: setId },
    data: { name, description: nullable(formData, "description") },
  });
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "AccreditationStandardSet", entityId: setId });
  revalidatePath(`/standards/${setId}`);
  revalidatePath("/standards");
}

export async function createStandardAction(setId: string, formData: FormData): Promise<void> {
  const user = await requireWriter();
  const code = str(formData, "code");
  const title = str(formData, "title");
  if (!code || !title) return;
  const dup = await prisma.standard.findUnique({ where: { setId_code: { setId, code } } });
  if (dup) return;
  const std = await prisma.standard.create({
    data: { setId, code, title, description: nullable(formData, "description"), order: orderFromCode(code) },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Standard", entityId: std.id, detail: { code } });
  revalidatePath(`/standards/${setId}`);
}

export async function updateStandardAction(standardId: string, formData: FormData): Promise<void> {
  const user = await requireWriter();
  const code = str(formData, "code");
  const title = str(formData, "title");
  if (!code || !title) return;
  const std = await prisma.standard.update({
    where: { id: standardId },
    data: { code, title, description: nullable(formData, "description"), order: orderFromCode(code) },
  });
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "Standard", entityId: standardId });
  revalidatePath(`/standards/${std.setId}`);
}

export async function deleteStandardAction(standardId: string): Promise<void> {
  const user = await requireWriter();
  const std = await prisma.standard.findUnique({
    where: { id: standardId },
    include: { criteria: { select: { _count: { select: { evidenceLinks: true, reportSections: true } } } } },
  });
  if (!std) return;
  // Refuse to delete a standard whose criteria are already used by evidence or reports.
  const used = std.criteria.some((c) => c._count.evidenceLinks > 0 || c._count.reportSections > 0);
  if (used) return;
  await prisma.standard.delete({ where: { id: standardId } });
  await logAudit({ userId: user.id, action: "DELETE", entityType: "Standard", entityId: standardId });
  revalidatePath(`/standards/${std.setId}`);
}

export async function createCriterionAction(standardId: string, formData: FormData): Promise<void> {
  const user = await requireWriter();
  const code = str(formData, "code");
  const title = str(formData, "title");
  if (!code || !title) return;
  const dup = await prisma.criterion.findUnique({ where: { standardId_code: { standardId, code } } });
  if (dup) return;
  const c = await prisma.criterion.create({
    data: { standardId, code, title, description: nullable(formData, "description"), order: orderFromCode(code) },
    include: { standard: { select: { setId: true } } },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Criterion", entityId: c.id, detail: { code } });
  revalidatePath(`/standards/${c.standard.setId}`);
}

export async function updateCriterionAction(criterionId: string, formData: FormData): Promise<void> {
  const user = await requireWriter();
  const code = str(formData, "code");
  const title = str(formData, "title");
  if (!code || !title) return;
  const c = await prisma.criterion.update({
    where: { id: criterionId },
    data: { code, title, description: nullable(formData, "description"), order: orderFromCode(code) },
    include: { standard: { select: { setId: true } } },
  });
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "Criterion", entityId: criterionId });
  revalidatePath(`/standards/${c.standard.setId}`);
}

export async function deleteCriterionAction(criterionId: string): Promise<void> {
  const user = await requireWriter();
  const c = await prisma.criterion.findUnique({
    where: { id: criterionId },
    include: { standard: { select: { setId: true } }, _count: { select: { evidenceLinks: true, reportSections: true } } },
  });
  if (!c || c._count.evidenceLinks > 0 || c._count.reportSections > 0) return;
  await prisma.criterion.delete({ where: { id: criterionId } });
  await logAudit({ userId: user.id, action: "DELETE", entityType: "Criterion", entityId: criterionId });
  revalidatePath(`/standards/${c.standard.setId}`);
}
