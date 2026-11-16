// Bulk user import from Excel: create/update accounts, department, program-scoped roles.
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { ROLE_LABELS, isInstitutionWide } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import { readTables, findCol, norm, str, dateCell, type SheetTable } from "./sheet";

export interface UserRow {
  line: string;
  fullName: string;
  email: string;
  role: Role;
  title: string | null;
  departmentId: string | null;
  departmentName: string | null;
  programs: Array<{ programId: string; code: string; role: Role }>;
  expiresAt: string | null; // ISO
  exists: boolean;
}
export interface UserIssue { where: string; message: string; level: "error" | "warning" }
export interface UserPlan { rows: UserRow[]; issues: UserIssue[] }
export interface ImportOptions { defaultProgramId?: string | null; defaultExpires?: string | null }

const ROLE_ALIASES: Array<[Role, string[]]> = [
  [Role.ADMIN, ["admin", "quan tri he thong", "quan tri"]],
  [Role.BOARD, ["board", "ban giam hieu", "bgh", "hieu truong", "lanh dao"]],
  [Role.QA_OFFICE, ["qa office", "qa", "phong kt dbcl", "phong khao thi dbcl", "khao thi", "dam bao chat luong", "dbcl"]],
  [Role.TRAINING_OFFICE, ["training office", "phong dao tao", "dao tao"]],
  [Role.FACULTY, ["faculty", "khoa vien", "khoa", "vien", "truong khoa"]],
  [Role.DEPARTMENT, ["department", "bo mon", "truong bo mon"]],
  [Role.LECTURER, ["lecturer", "giang vien", "gv"]],
  [Role.HR_OFFICE, ["hr office", "phong tcns", "phong to chuc nhan su", "to chuc nhan su", "nhan su"]],
  [Role.LIBRARY, ["library", "thu vien", "trung tam thu vien"]],
  [Role.IT_CENTER, ["it center", "trung tam cntt", "cntt"]],
  [Role.STUDENT_AFFAIRS, ["student affairs", "phong ctsv", "phong cong tac sinh vien", "cong tac sinh vien", "ctsv"]],
  [Role.EXTERNAL_REVIEWER, ["external reviewer", "danh gia vien ngoai", "danh gia ngoai", "dgn"]],
];
export function parseRole(v: string): Role | null {
  const raw = v.trim().toUpperCase().replace(/\s+/g, "_");
  if ((Object.values(Role) as string[]).includes(raw)) return raw as Role;
  const n = norm(v);
  if (!n) return null;
  for (const [role, label] of Object.entries(ROLE_LABELS) as Array<[Role, string]>) if (norm(label) === n) return role;
  for (const [role, aliases] of ROLE_ALIASES) if (aliases.includes(n)) return role;
  for (const [role, aliases] of ROLE_ALIASES) if (aliases.some((a) => a.length > 3 && n.includes(a))) return role;
  return null;
}

const isHeader = (cells: string[]) => cells.some((c) => c === "email" || c === "email dang nhap") && cells.some((c) => /ho va ten|ho ten|full name|ten/.test(c));

export async function parseUserFiles(files: Array<{ name: string; buffer: Buffer }>, opts: ImportOptions): Promise<UserPlan> {
  const plan: UserPlan = { rows: [], issues: [] };
  const [departments, programs] = await Promise.all([
    prisma.department.findMany({ select: { id: true, code: true, name: true } }),
    prisma.program.findMany({ select: { id: true, code: true } }),
  ]);
  const dept = (v: string) => {
    const n = norm(v);
    return departments.find((d) => norm(d.name) === n || norm(d.code) === n || norm(d.name).endsWith(n)) ?? null;
  };
  const progByCode = new Map(programs.map((p) => [p.code.toUpperCase(), p]));
  const defaultProgram = opts.defaultProgramId ? programs.find((p) => p.id === opts.defaultProgramId) ?? null : null;

  for (const f of files) {
    let tables: SheetTable[];
    try {
      tables = await readTables(f, isHeader);
    } catch {
      plan.issues.push({ where: f.name, message: "Không đọc được tệp.", level: "error" });
      continue;
    }
    for (const t of tables) {
      const c = {
        name: findCol(t.headers, ["Họ và tên", "Họ tên", "Full name", "Tên"]),
        email: findCol(t.headers, ["Email đăng nhập", "Email"]),
        roleCode: findCol(t.headers, ["Mã vai trò", "Role code"], { exact: true }),
        role: findCol(t.headers, ["Vai trò hệ thống", "Vai trò", "Role"], { exact: true }),
        title: findCol(t.headers, ["Chức danh", "Chức vụ", "Title"]),
        dept: findCol(t.headers, ["Bộ môn", "Department"]),
        prog: findCol(t.headers, ["Chương trình", "Program", "Mã chương trình"], { exact: true }),
        progRole: findCol(t.headers, ["Vai trò trong chương trình", "Vai trò CTĐT", "Program role"]),
        exp: findCol(t.headers, ["Hết hạn", "Ngày hết hạn", "Expires"]),
      };
      if (c.email < 0 || c.name < 0) continue;
      for (const r of t.rows) {
        const where = `${t.file} › ${t.sheet} › dòng ${r.rowNumber}`;
        const email = str(r.cells[c.email]).toLowerCase();
        const fullName = str(r.cells[c.name]);
        if (!email && !fullName) continue;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName) {
          plan.issues.push({ where, message: `Email "${email}" hoặc họ tên không hợp lệ.`, level: "error" });
          continue;
        }
        const roleText = (c.roleCode >= 0 && str(r.cells[c.roleCode])) || (c.role >= 0 ? str(r.cells[c.role]) : "");
        const role = roleText ? parseRole(roleText) : Role.LECTURER;
        if (!role) {
          plan.issues.push({ where, message: `Không nhận ra vai trò "${roleText}".`, level: "error" });
          continue;
        }
        const deptText = c.dept >= 0 ? str(r.cells[c.dept]) : "";
        const d = deptText ? dept(deptText) : null;
        if (deptText && !d) plan.issues.push({ where, message: `Chưa có bộ môn "${deptText}" – bỏ qua cột bộ môn (khai báo ở Quản trị › Tổ chức).`, level: "warning" });

        const progCodes = c.prog >= 0 ? str(r.cells[c.prog]).split(/[,;]/).map((s) => s.trim().toUpperCase()).filter(Boolean) : [];
        const progRoleText = c.progRole >= 0 ? str(r.cells[c.progRole]) : "";
        const progRole = (progRoleText && parseRole(progRoleText)) || role;
        const progs: UserRow["programs"] = [];
        for (const code of progCodes) {
          const p = progByCode.get(code);
          if (p) progs.push({ programId: p.id, code: p.code, role: progRole });
          else plan.issues.push({ where, message: `Không có chương trình mã "${code}".`, level: "warning" });
        }
        if (!progCodes.length && defaultProgram && !isInstitutionWide(role)) progs.push({ programId: defaultProgram.id, code: defaultProgram.code, role: progRole });

        const expRaw = c.exp >= 0 ? r.cells[c.exp] : null;
        let exp = dateCell(expRaw);
        if (!exp && role === Role.EXTERNAL_REVIEWER && opts.defaultExpires) exp = dateCell(opts.defaultExpires);
        if (role === Role.EXTERNAL_REVIEWER && !exp) {
          plan.issues.push({ where, message: "Đánh giá viên ngoài cần ngày hết hạn.", level: "error" });
          continue;
        }
        plan.rows.push({
          line: where, fullName, email, role,
          title: c.title >= 0 ? str(r.cells[c.title]) || null : null,
          departmentId: d?.id ?? null, departmentName: d?.name ?? null,
          programs: progs, expiresAt: exp ? exp.toISOString() : null, exists: false,
        });
      }
    }
  }
  const seen = new Map<string, UserRow>();
  for (const r of plan.rows) {
    if (seen.has(r.email)) plan.issues.push({ where: r.line, message: `Email ${r.email} lặp lại – dùng dòng sau cùng.`, level: "warning" });
    seen.set(r.email, r);
  }
  plan.rows = [...seen.values()];
  const existing = new Set((await prisma.user.findMany({ where: { email: { in: plan.rows.map((r) => r.email) } }, select: { email: true } })).map((u) => u.email));
  plan.rows.forEach((r) => (r.exists = existing.has(r.email)));
  if (!plan.rows.length && !plan.issues.length) plan.issues.push({ where: "Tệp tải lên", message: "Không tìm thấy bảng có cột Họ và tên + Email. Hãy dùng tệp mẫu.", level: "error" });
  return plan;
}

/** Readable temporary password: 10 chars with upper, lower, digit and a symbol. */
export function tempPassword(): string {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnopqrstuvwxyz", D = "23456789", S = "@#$%";
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(U), pick(L), pick(L), pick(L), pick(L), pick(D), pick(D), pick(D), pick(S), pick(U)];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export async function applyUsers(plan: UserPlan) {
  const credentials: Array<{ fullName: string; email: string; password: string; role: string }> = [];
  let created = 0, updated = 0, assigned = 0;
  for (const r of plan.rows) {
    const existing = await prisma.user.findUnique({ where: { email: r.email }, select: { id: true } });
    let userId: string;
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { fullName: r.fullName, role: r.role, title: r.title ?? undefined, unit: r.title ?? undefined, departmentId: r.departmentId ?? undefined, expiresAt: r.expiresAt ? new Date(r.expiresAt) : undefined },
      });
      userId = existing.id;
      updated++;
    } else {
      const password = tempPassword();
      const u = await prisma.user.create({
        data: { email: r.email, fullName: r.fullName, role: r.role, title: r.title, unit: r.title, departmentId: r.departmentId, expiresAt: r.expiresAt ? new Date(r.expiresAt) : null, passwordHash: await hashPassword(password) },
      });
      userId = u.id;
      created++;
      credentials.push({ fullName: r.fullName, email: r.email, password, role: ROLE_LABELS[r.role] });
    }
    for (const p of r.programs) {
      await prisma.userProgramRole.upsert({ where: { userId_programId_role: { userId, programId: p.programId, role: p.role } }, update: {}, create: { userId, programId: p.programId, role: p.role } });
      assigned++;
    }
  }
  return { created, updated, assigned, credentials };
}
