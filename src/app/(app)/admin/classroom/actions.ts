"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notify";
import { cloneProgramContent, wipeProgramContent, addMembers, type CloneOptions } from "@/lib/sandbox";

async function guard() {
  const user = await requireUser();
  if (!can(user.role, "admin:users")) throw new Error("Chỉ Quản trị hệ thống được quản lý lớp thực hành.");
  return user;
}

const opt = (fd: FormData): CloneOptions => ({
  evidence: fd.get("evidence") === "on",
  evidenceStatus: fd.get("evidenceStatus") === "keep" ? "keep" : "uploaded",
  sarText: fd.get("sarText") === "on",
  extras: fd.get("extras") === "on",
});

export interface ActionResult { ok: boolean; message: string }

/** Create N sandbox copies of a template program; optionally spread selected users over them. */
export async function createSandboxesAction(fd: FormData): Promise<ActionResult> {
  try {
    const user = await guard();
    const templateId = String(fd.get("templateId") || "");
    const label = String(fd.get("label") || "").trim() || "Lớp thực hành";
    const prefix = String(fd.get("prefix") || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const groups = Math.max(1, Math.min(20, Number(fd.get("groups") || 1)));
    const userIds = fd.getAll("userIds").map(String).filter(Boolean);
    const t = await prisma.program.findUnique({ where: { id: templateId }, select: { id: true, code: true, nameVi: true, nameEn: true, facultyId: true, degreeLevel: true, totalCredits: true, objectives: true } });
    if (!t) return { ok: false, message: "Chọn chương trình mẫu." };
    const base = prefix || `${t.code}-TH`;
    const created: string[] = [];
    for (let i = 1; i <= groups; i++) {
      let code = `${base}${groups > 1 || !prefix ? i : ""}`;
      for (let k = 2; await prisma.program.findUnique({ where: { code }, select: { id: true } }); k++) code = `${base}${i}-${k}`;
      const p = await prisma.program.create({
        data: {
          code, nameVi: `${t.nameVi} (thực hành)`, nameEn: t.nameEn, facultyId: t.facultyId, degreeLevel: t.degreeLevel, totalCredits: t.totalCredits, objectives: t.objectives,
          description: `Bản sao thực hành của ${t.code} cho ${label}${groups > 1 ? ` – Nhóm ${i}` : ""}. Dữ liệu tách biệt với chương trình thật.`,
          isSandbox: true, sandboxTemplateId: t.id, sandboxLabel: groups > 1 ? `${label} – Nhóm ${i}` : label,
        },
      });
      await cloneProgramContent(t.id, p.id, opt(fd));
      // Round-robin the selected learners over the groups.
      const members = userIds.filter((_, idx) => idx % groups === i - 1);
      if (members.length) {
        await addMembers(p.id, members);
        for (const uid of members) await createNotification({ userId: uid, title: `Bạn được xếp vào ${p.sandboxLabel}`, message: `Chương trình thực hành ${code}`, link: `/programs/${p.id}` });
      }
      created.push(code);
    }
    await logAudit({ userId: user.id, action: "SANDBOX_CREATE", entityType: "Program", entityId: t.id, detail: { created, label, options: { ...opt(fd) }, members: userIds.length } });
    revalidatePath("/admin/classroom");
    revalidatePath("/programs");
    return { ok: true, message: `Đã tạo ${created.length} chương trình thực hành: ${created.join(", ")}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Lỗi tạo lớp thực hành." };
  }
}

/** Put a sandbox back to the template's current state (members are kept). */
export async function resetSandboxAction(programId: string, fd: FormData): Promise<ActionResult> {
  try {
    const user = await guard();
    const p = await prisma.program.findUnique({ where: { id: programId }, select: { isSandbox: true, sandboxTemplateId: true, code: true } });
    if (!p?.isSandbox || !p.sandboxTemplateId) return { ok: false, message: "Chỉ đặt lại được chương trình thực hành có chương trình mẫu." };
    await wipeProgramContent(programId);
    const counts = await cloneProgramContent(p.sandboxTemplateId, programId, opt(fd));
    await logAudit({ userId: user.id, action: "SANDBOX_RESET", entityType: "Program", entityId: programId, detail: { counts } });
    revalidatePath("/admin/classroom");
    return { ok: true, message: `Đã đặt lại ${p.code} (${counts.evidence} minh chứng, ${counts.sections} mục báo cáo).` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Lỗi đặt lại." };
  }
}

export async function deleteSandboxAction(programId: string): Promise<ActionResult> {
  const user = await guard();
  const p = await prisma.program.findUnique({ where: { id: programId }, select: { isSandbox: true, code: true } });
  if (!p?.isSandbox) return { ok: false, message: "Chỉ xóa được chương trình thực hành." };
  await prisma.program.delete({ where: { id: programId } }); // stored evidence files are shared with the template and are not deleted
  await logAudit({ userId: user.id, action: "SANDBOX_DELETE", entityType: "Program", entityId: programId, detail: { code: p.code } });
  revalidatePath("/admin/classroom");
  revalidatePath("/programs");
  return { ok: true, message: `Đã xóa ${p.code}.` };
}

export async function addSandboxMembersAction(programId: string, userIds: string[]): Promise<ActionResult> {
  const user = await guard();
  const p = await prisma.program.findUnique({ where: { id: programId }, select: { isSandbox: true, code: true, sandboxLabel: true } });
  if (!p?.isSandbox) return { ok: false, message: "Không phải chương trình thực hành." };
  const n = await addMembers(programId, userIds);
  for (const uid of userIds) await createNotification({ userId: uid, title: `Bạn được xếp vào ${p.sandboxLabel ?? p.code}`, message: `Chương trình thực hành ${p.code}`, link: `/programs/${programId}` });
  await logAudit({ userId: user.id, action: "SANDBOX_MEMBERS", entityType: "Program", entityId: programId, detail: { added: n } });
  revalidatePath("/admin/classroom");
  return { ok: true, message: `Đã thêm ${n} thành viên vào ${p.code}.` };
}

/** Make a regular (non-sandbox) duplicate of a program, e.g. to start a new program from an existing one. */
export async function duplicateProgramAction(fd: FormData): Promise<ActionResult> {
  try {
    const user = await guard();
    const templateId = String(fd.get("templateId") || "");
    const code = String(fd.get("code") || "").trim().toUpperCase();
    const nameVi = String(fd.get("nameVi") || "").trim();
    if (!code || !nameVi) return { ok: false, message: "Nhập mã và tên chương trình mới." };
    if (await prisma.program.findUnique({ where: { code } })) return { ok: false, message: `Mã ${code} đã tồn tại.` };
    const t = await prisma.program.findUniqueOrThrow({ where: { id: templateId } });
    const p = await prisma.program.create({ data: { code, nameVi, nameEn: t.nameEn, facultyId: t.facultyId, degreeLevel: t.degreeLevel, totalCredits: t.totalCredits, objectives: t.objectives, description: `Nhân bản từ ${t.code}.` } });
    const counts = await cloneProgramContent(t.id, p.id, opt(fd));
    await logAudit({ userId: user.id, action: "PROGRAM_DUPLICATE", entityType: "Program", entityId: p.id, detail: { from: t.code, counts } });
    revalidatePath("/programs");
    return { ok: true, message: `Đã tạo ${code} từ ${t.code}: ${counts.courses} học phần, ${counts.plos} PLO, ${counts.evidence} minh chứng.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Lỗi nhân bản." };
  }
}
