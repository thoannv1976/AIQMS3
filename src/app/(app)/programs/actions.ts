"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { DegreeLevel, CycleStatus, ReportStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

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

// ============================ Accreditation cycles ============================

const fstr = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fdate = (fd: FormData, k: string) => {
  const v = fstr(fd, k);
  return v ? new Date(v) : null;
};

export async function createCycleAction(programId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "program:write") && !can(user.role, "report:write")) return;
  const standardSetId = fstr(formData, "standardSetId");
  const year = parseInt(fstr(formData, "year"), 10) || new Date().getFullYear();
  const set = standardSetId ? await prisma.accreditationStandardSet.findUnique({ where: { id: standardSetId } }) : null;
  if (!set) return;
  const shortSet = set.name.split("—")[0].trim();
  const name = fstr(formData, "name") || `Tự đánh giá theo ${shortSet} — ${year}`;
  const cycle = await prisma.accreditationCycle.create({
    data: {
      programId,
      standardSetId,
      name,
      year,
      startDate: fdate(formData, "startDate"),
      targetDate: fdate(formData, "targetDate"),
      status: CycleStatus.PLANNING,
    },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "AccreditationCycle", entityId: cycle.id, detail: { name } });
  revalidatePath(`/programs/${programId}`);
}

export async function updateCycleStatusAction(cycleId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "program:write") && !can(user.role, "report:write")) return;
  const status = fstr(formData, "status") as CycleStatus;
  if (!Object.values(CycleStatus).includes(status)) return;
  const cycle = await prisma.accreditationCycle.update({ where: { id: cycleId }, data: { status } });
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "AccreditationCycle", entityId: cycleId, detail: { status } });
  revalidatePath(`/programs/${cycle.programId}`);
}

/**
 * Create a self-assessment report for a cycle, with one section per criterion
 * (granularity = "criterion", default) or one per standard (granularity = "standard").
 */
export async function createReportAction(cycleId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "report:write")) return;
  const cycle = await prisma.accreditationCycle.findUnique({
    where: { id: cycleId },
    include: {
      program: true,
      standardSet: {
        include: { standards: { orderBy: { order: "asc" }, include: { criteria: { orderBy: { order: "asc" } } } } },
      },
    },
  });
  if (!cycle) return;
  const granularity = fstr(formData, "granularity") === "standard" ? "standard" : "criterion";
  const title = fstr(formData, "title") || `Báo cáo tự đánh giá chương trình ${cycle.program.code} — ${cycle.name}`;

  const report = await prisma.selfAssessmentReport.create({ data: { cycleId, title, status: ReportStatus.DRAFT } });

  let order = 0;
  const sections: Prisma.ReportSectionCreateManyInput[] = [];
  for (const std of cycle.standardSet.standards) {
    if (granularity === "standard") {
      sections.push({
        reportId: report.id,
        standardId: std.id,
        criterionId: std.criteria[0]?.id ?? null,
        title: `Tiêu chuẩn ${std.code}: ${std.title}`,
        order: order++,
      });
    } else {
      for (const c of std.criteria) {
        sections.push({ reportId: report.id, criterionId: c.id, title: `Tiêu chí ${c.code}: ${c.title}`, order: order++ });
      }
    }
  }
  if (sections.length) await prisma.reportSection.createMany({ data: sections });

  await logAudit({ userId: user.id, action: "CREATE", entityType: "SelfAssessmentReport", entityId: report.id, detail: { granularity, sections: sections.length } });
  revalidatePath("/reports");
  redirect(`/reports/${report.id}`);
}

// ============================ Courses ============================

export async function createCourseAction(programId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "program:write") && !can(user.role, "outcome:write")) return;
  const code = fstr(formData, "code").toUpperCase();
  const nameVi = fstr(formData, "nameVi");
  if (!code || !nameVi) return;
  const dup = await prisma.course.findUnique({ where: { programId_code: { programId, code } } });
  if (dup) return;
  const course = await prisma.course.create({
    data: {
      programId,
      code,
      nameVi,
      credits: parseInt(fstr(formData, "credits"), 10) || 3,
      semester: parseInt(fstr(formData, "semester"), 10) || null,
      type: fstr(formData, "type") || null,
    },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Course", entityId: course.id, detail: { code } });
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/outcomes");
}

export async function deleteCourseAction(courseId: string): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "program:write")) return;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return;
  await prisma.course.delete({ where: { id: courseId } });
  await logAudit({ userId: user.id, action: "DELETE", entityType: "Course", entityId: courseId, detail: { code: course.code } });
  revalidatePath(`/programs/${course.programId}`);
  revalidatePath("/outcomes");
}
