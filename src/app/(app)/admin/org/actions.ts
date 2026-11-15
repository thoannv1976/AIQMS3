"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export interface OrgFormState {
  error?: string;
  ok?: string;
}

async function guard() {
  const user = await requireUser();
  if (!can(user.role, "admin:users")) throw new Error("Bạn không có quyền quản trị tổ chức.");
  return user;
}

function codeOf(fd: FormData) {
  return String(fd.get("code") || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
}

export async function createFacultyAction(_p: OrgFormState, fd: FormData): Promise<OrgFormState> {
  const user = await guard();
  const code = codeOf(fd);
  const name = String(fd.get("name") || "").trim();
  if (!code || !name) return { error: "Nhập mã và tên khoa." };
  if (await prisma.faculty.findUnique({ where: { code } })) return { error: `Mã khoa ${code} đã tồn tại.` };
  const uni = await prisma.university.findFirst({ orderBy: { createdAt: "asc" } });
  if (!uni) return { error: "Chưa có thông tin trường (University)." };
  const f = await prisma.faculty.create({ data: { code, name, universityId: uni.id } });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Faculty", entityId: f.id, detail: { code, name } });
  revalidatePath("/admin/org");
  return { ok: `Đã tạo khoa ${name}.` };
}

export async function createDepartmentAction(_p: OrgFormState, fd: FormData): Promise<OrgFormState> {
  const user = await guard();
  const code = codeOf(fd);
  const name = String(fd.get("name") || "").trim();
  const facultyId = String(fd.get("facultyId") || "");
  if (!code || !name || !facultyId) return { error: "Chọn khoa và nhập mã, tên bộ môn." };
  if (await prisma.department.findUnique({ where: { code } })) return { error: `Mã bộ môn ${code} đã tồn tại.` };
  const d = await prisma.department.create({ data: { code, name, facultyId } });
  await logAudit({ userId: user.id, action: "CREATE", entityType: "Department", entityId: d.id, detail: { code, name } });
  revalidatePath("/admin/org");
  return { ok: `Đã tạo bộ môn ${name}.` };
}

export async function renameFacultyAction(id: string, fd: FormData) {
  const user = await guard();
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  await prisma.faculty.update({ where: { id }, data: { name } });
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "Faculty", entityId: id, detail: { name } });
  revalidatePath("/admin/org");
}

export async function deleteFacultyAction(id: string) {
  const user = await guard();
  const n = await prisma.program.count({ where: { facultyId: id } });
  if (n > 0) throw new Error("Khoa còn chương trình đào tạo — chuyển chương trình sang khoa khác trước khi xóa.");
  await prisma.faculty.delete({ where: { id } });
  await logAudit({ userId: user.id, action: "DELETE", entityType: "Faculty", entityId: id });
  revalidatePath("/admin/org");
}

export async function deleteDepartmentAction(id: string) {
  const user = await guard();
  await prisma.department.delete({ where: { id } });
  await logAudit({ userId: user.id, action: "DELETE", entityType: "Department", entityId: id });
  revalidatePath("/admin/org");
}

export async function setUserDepartmentAction(fd: FormData) {
  const user = await guard();
  const userId = String(fd.get("userId") || "");
  const departmentId = String(fd.get("departmentId") || "") || null;
  if (!userId) return;
  await prisma.user.update({ where: { id: userId }, data: { departmentId } });
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "User", entityId: userId, detail: { departmentId } });
  revalidatePath("/admin/org");
}

/** Move a program to another faculty (program detail page; needs admin:users). */
export async function setProgramFacultyAction(programId: string, fd: FormData) {
  const user = await guard();
  const facultyId = String(fd.get("facultyId") || "");
  if (!facultyId) return;
  await prisma.program.update({ where: { id: programId }, data: { facultyId } });
  await logAudit({ userId: user.id, action: "UPDATE", entityType: "Program", entityId: programId, detail: { facultyId } });
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/dashboard");
}
