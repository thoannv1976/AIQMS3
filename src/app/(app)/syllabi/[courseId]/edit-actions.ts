"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, canInProgram, type Capability } from "@/lib/rbac";
import { programRolesOf } from "@/lib/program-context";
import { logAudit } from "@/lib/audit";
import { CloPloStrength, SyllabusStatus } from "@/generated/prisma/enums";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function requireCourseWriter(courseId: string, capability: Capability) {
  const user = await requireUser();
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, programId: true } });
  if (!course) return null;
  if (can(user.role, capability)) return { user, course };
  const roles = await programRolesOf(user.id, course.programId);
  return canInProgram(user.role, roles, capability) ? { user, course } : null;
}

function revalidate(courseId: string) {
  revalidatePath(`/syllabi/${courseId}`);
  revalidatePath("/syllabi");
  revalidatePath("/curriculum-check");
}

export async function createCloAction(courseId: string, formData: FormData): Promise<void> {
  const ctx = await requireCourseWriter(courseId, "outcome:write");
  if (!ctx) return;
  const code = str(formData, "code").toUpperCase();
  const description = str(formData, "description");
  if (!code || !description) return;
  const dup = await prisma.clo.findUnique({ where: { courseId_code: { courseId, code } } });
  if (dup) return;
  const clo = await prisma.clo.create({ data: { courseId, code, description } });
  const ploId = str(formData, "ploId");
  if (ploId) await prisma.cloPloLink.create({ data: { cloId: clo.id, ploId, strength: CloPloStrength.MEDIUM } });
  await logAudit({ userId: ctx.user.id, action: "CREATE", entityType: "Clo", entityId: clo.id, detail: { code } });
  revalidate(courseId);
}

export async function updateCloAction(cloId: string, formData: FormData): Promise<void> {
  const clo = await prisma.clo.findUnique({ where: { id: cloId } });
  if (!clo) return;
  const ctx = await requireCourseWriter(clo.courseId, "outcome:write");
  if (!ctx) return;
  const code = str(formData, "code").toUpperCase();
  const description = str(formData, "description");
  if (!code || !description) return;
  await prisma.clo.update({ where: { id: cloId }, data: { code, description } });
  await logAudit({ userId: ctx.user.id, action: "UPDATE", entityType: "Clo", entityId: cloId });
  revalidate(clo.courseId);
}

export async function deleteCloAction(cloId: string): Promise<void> {
  const clo = await prisma.clo.findUnique({ where: { id: cloId } });
  if (!clo) return;
  const ctx = await requireCourseWriter(clo.courseId, "outcome:write");
  if (!ctx) return;
  await prisma.clo.delete({ where: { id: cloId } });
  await logAudit({ userId: ctx.user.id, action: "DELETE", entityType: "Clo", entityId: cloId, detail: { code: clo.code } });
  revalidate(clo.courseId);
}

export async function linkCloPloAction(cloId: string, formData: FormData): Promise<void> {
  const clo = await prisma.clo.findUnique({ where: { id: cloId } });
  if (!clo) return;
  const ctx = await requireCourseWriter(clo.courseId, "outcome:write");
  if (!ctx) return;
  const ploId = str(formData, "ploId");
  const strength = (str(formData, "strength") || "MEDIUM") as CloPloStrength;
  if (!ploId || !Object.values(CloPloStrength).includes(strength)) return;
  await prisma.cloPloLink.upsert({
    where: { cloId_ploId: { cloId, ploId } },
    update: { strength },
    create: { cloId, ploId, strength },
  });
  await logAudit({ userId: ctx.user.id, action: "UPDATE", entityType: "CloPloLink", entityId: cloId, detail: { ploId, strength } });
  revalidate(clo.courseId);
}

export async function unlinkCloPloAction(linkId: string): Promise<void> {
  const link = await prisma.cloPloLink.findUnique({ where: { id: linkId }, include: { clo: true } });
  if (!link) return;
  const ctx = await requireCourseWriter(link.clo.courseId, "outcome:write");
  if (!ctx) return;
  await prisma.cloPloLink.delete({ where: { id: linkId } });
  await logAudit({ userId: ctx.user.id, action: "DELETE", entityType: "CloPloLink", entityId: linkId });
  revalidate(link.clo.courseId);
}

/** Create or update the course's current syllabus (latest version). */
export async function saveSyllabusAction(courseId: string, formData: FormData): Promise<void> {
  const ctx = await requireCourseWriter(courseId, "syllabus:write");
  if (!ctx) return;
  const data = {
    version: str(formData, "version") || "1.0",
    objectives: str(formData, "objectives") || null,
    content: str(formData, "content") || null,
    teachingMethods: str(formData, "teachingMethods") || null,
    assessmentMethods: str(formData, "assessmentMethods") || null,
    materials: str(formData, "materials") || null,
  };
  const status = str(formData, "status") as SyllabusStatus;
  const latest = await prisma.courseSyllabus.findFirst({ where: { courseId }, orderBy: { createdAt: "desc" } });
  const statusOk = Object.values(SyllabusStatus).includes(status) ? status : undefined;
  if (latest) {
    await prisma.courseSyllabus.update({ where: { id: latest.id }, data: { ...data, status: statusOk } });
  } else {
    await prisma.courseSyllabus.create({ data: { courseId, ...data, status: statusOk ?? SyllabusStatus.DRAFT } });
  }
  await logAudit({ userId: ctx.user.id, action: latest ? "UPDATE" : "CREATE", entityType: "CourseSyllabus", entityId: courseId });
  revalidate(courseId);
}
