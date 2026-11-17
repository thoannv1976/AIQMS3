"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { DegreeLevel, CycleStatus, ReportStatus, ReportSectionStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { readDocx } from "@/lib/import/docx";
import { extractProgramInfo, infoScore, composeObjectives, composeDescription, matchFaculty } from "@/lib/import/program-info";

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
  const nameEn = String(formData.get("nameEn") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const versionLabel = String(formData.get("versionLabel") || "").trim();
  const versionYear = parseInt(String(formData.get("versionYear") || "0"), 10);
  const versionSummary = String(formData.get("versionSummary") || "").trim() || null;

  if (!code || !nameVi || !facultyId) return { error: "Vui lòng nhập mã, tên chương trình và khoa." };

  const existing = await prisma.program.findUnique({ where: { code } });
  if (existing) return { error: `Mã chương trình "${code}" đã tồn tại.` };

  const program = await prisma.program.create({
    data: {
      code,
      nameVi,
      nameEn,
      facultyId,
      degreeLevel,
      totalCredits,
      objectives,
      description,
      // Version declared in the imported Word file ("Phiên bản CTĐT: 2024 – QĐ …").
      ...(versionLabel && versionYear ? { versions: { create: { versionLabel, year: versionYear, summary: versionSummary } } } : {}),
    },
  });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Program", entityId: program.id, detail: { code, fromWord: String(formData.get("fromWord") ?? "") || undefined } });
  revalidatePath("/programs");
  redirect(`/programs/${program.id}`);
}

export interface ProgramPrefill {
  code: string;
  nameVi: string;
  nameEn: string;
  facultyId: string;
  degreeLevel: DegreeLevel;
  totalCredits: string;
  objectives: string;
  description: string;
  versionLabel: string;
  versionYear: string;
  versionSummary: string;
}
export type ProgramDocxResult = { ok: true; prefill: ProgramPrefill; found: string[]; warnings: string[] } | { ok: false; error: string };

/** Read a program declaration (.docx) and return values to pre-fill the "new program" form. Nothing is saved. */
export async function parseProgramDocxAction(fd: FormData): Promise<ProgramDocxResult> {
  const user = await requireUser();
  if (!can(user.role, "program:write")) return { ok: false, error: "Bạn không có quyền tạo chương trình." };
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Chọn một tệp Word (.docx)." };
  if (!/\.docx$/i.test(file.name)) return { ok: false, error: "Chỉ hỗ trợ tệp Word .docx (tệp .doc cũ: mở bằng Word và Lưu thành .docx)." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Tệp vượt quá 10 MB." };
  let info;
  try {
    info = extractProgramInfo(await readDocx(Buffer.from(await file.arrayBuffer())));
  } catch {
    return { ok: false, error: "Không đọc được tệp Word." };
  }
  if (infoScore(info) < 2)
    return { ok: false, error: "Không tìm thấy thông tin chương trình. Tệp cần có bảng hoặc dòng dạng “Mã chương trình | …”, “Tên chương trình | …”, “Tổng số tín chỉ | …”." };
  const warnings: string[] = [];
  const faculties = await prisma.faculty.findMany({ select: { id: true, name: true } });
  const faculty = matchFaculty(faculties, info.facultyName);
  if (info.facultyName && !faculty) warnings.push(`Chưa có khoa “${info.facultyName}” trong hệ thống — hãy chọn khoa (hoặc tạo khoa ở Quản trị › Cơ cấu tổ chức).`);
  if (info.code && (await prisma.program.findUnique({ where: { code: info.code } }))) warnings.push(`Mã chương trình ${info.code} đã tồn tại — đổi mã khác trước khi tạo.`);
  if (!info.code) warnings.push("Tệp không có mã chương trình — hãy nhập mã.");
  const found = [
    info.code && "mã chương trình",
    info.nameVi && "tên",
    info.nameEn && "tên tiếng Anh",
    info.degreeLevel && "trình độ",
    info.totalCredits && "số tín chỉ",
    faculty && "khoa",
    info.generalObjective && "mục tiêu chung",
    info.objectivesList.length && `${info.objectivesList.length} mục tiêu cụ thể (PO)`,
    info.majorCode && "mã ngành",
    info.versionSummary && "phiên bản",
  ].filter(Boolean) as string[];
  return {
    ok: true,
    found,
    warnings,
    prefill: {
      code: info.code ?? "",
      nameVi: info.nameVi ?? "",
      nameEn: info.nameEn ?? "",
      facultyId: faculty?.id ?? "",
      degreeLevel: info.degreeLevel ?? DegreeLevel.BACHELOR,
      totalCredits: info.totalCredits?.toString() ?? "",
      objectives: composeObjectives(info) ?? "",
      description: composeDescription(info) ?? "",
      versionLabel: info.versionLabel ?? "",
      versionYear: info.versionYear?.toString() ?? "",
      versionSummary: info.versionSummary ?? "",
    },
  };
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

/**
 * Start the next accreditation cycle from an existing one: same standard set, a new report whose
 * sections mirror the previous report. Optionally carries over the SAR text (as a starting draft)
 * and the writer/reviewer assignments. Evidence belongs to the program, so it stays available.
 */
export async function cloneCycleAction(cycleId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "program:write") && !can(user.role, "report:write")) return;
  const src = await prisma.accreditationCycle.findUnique({
    where: { id: cycleId },
    include: { standardSet: true, reports: { orderBy: { createdAt: "desc" }, take: 1, include: { sections: true } } },
  });
  if (!src) return;
  const year = parseInt(fstr(formData, "year"), 10) || src.year + 1;
  const name = fstr(formData, "name") || `${src.standardSet.name.split("—")[0].trim()} — ${year}`;
  const copyText = formData.get("copyText") === "on";
  const copyAssign = formData.get("copyAssign") === "on";
  const cycle = await prisma.accreditationCycle.create({
    data: { programId: src.programId, standardSetId: src.standardSetId, name, year, status: CycleStatus.PLANNING },
  });
  const rep = src.reports[0];
  if (rep) {
    const nr = await prisma.selfAssessmentReport.create({ data: { cycleId: cycle.id, title: rep.title.replace(/\b(19|20)\d{2}\b/g, String(year)) } });
    await prisma.reportSection.createMany({
      data: rep.sections.map((s) => ({
        reportId: nr.id, standardId: s.standardId, criterionId: s.criterionId, title: s.title, order: s.order,
        content: copyText ? s.content : null, strengths: copyText ? s.strengths : null, weaknesses: copyText ? s.weaknesses : null, improvementPlan: copyText ? s.improvementPlan : null,
        status: copyText && s.content ? ReportSectionStatus.DRAFTING : ReportSectionStatus.NOT_STARTED,
        assignedToId: copyAssign ? s.assignedToId : null, reviewerId: copyAssign ? s.reviewerId : null,
      })),
    });
  }
  await logAudit({ userId: user.id, action: "CLONE_CYCLE", entityType: "AccreditationCycle", entityId: cycle.id, detail: { from: cycleId, copyText, copyAssign } });
  revalidatePath(`/programs/${src.programId}`);
}
