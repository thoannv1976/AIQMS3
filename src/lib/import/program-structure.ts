// Import a program's structure from Excel: courses, PLOs, course↔PLO matrix (I/R/M) and CLOs.
// Accepts the system template or similar sheets (header row is detected; column names are matched loosely).
import { prisma } from "@/lib/db";
import { ContributionLevel, CloPloStrength } from "@/generated/prisma/enums";
import { readTables, findCol, norm, str, int, type SheetTable } from "./sheet";
import { readDocx } from "./docx";
import { extractProgramInfo, infoScore, composeObjectives, composeDescription, type ProgramInfo } from "./program-info";

export interface CourseRow { code: string; nameVi: string; nameEn: string | null; credits: number; semester: number | null; type: string | null }
export interface PloRow { code: string; description: string; category: string | null }
export interface MatrixRow { courseCode: string; cells: Array<{ ploCode: string; level: ContributionLevel | null }> }
export interface CloRow { courseCode: string; code: string; description: string; plos: string[]; strength: CloPloStrength }
export interface ImportIssue { where: string; message: string; level: "error" | "warning" }

export interface StructurePlan {
  courses: CourseRow[];
  plos: PloRow[];
  matrix: MatrixRow[];
  clos: CloRow[];
  issues: ImportIssue[];
  /** Recognised sheets; `skipped` ones were unticked by the user and are not imported. */
  sheets: Array<{ where: string; kind: string; rows: number; skipped?: boolean }>;
  /** General program information found in a Word file (declaration table, PO1…). */
  info: (ProgramInfo & { file: string }) | null;
}

export interface ProgramInfoChange { field: string; label: string; current: string; next: string }

export interface StructurePreview {
  plan: StructurePlan;
  /** Program fields the Word file would change (only filled when `plan.info` is present). */
  infoChanges: ProgramInfoChange[];
  counts: Record<"courses" | "plos" | "matrixCells" | "clos", { create: number; update: number }>;
}

const KEY_HEADERS = new Set(["ma", "ma hp", "ma hoc phan", "ma clo", "ma pi", "ma plo", "code", "course code", "plo code", "clo code"]);
const isHeader = (cells: string[]) => cells.filter(Boolean).length >= 2 && cells.some((c) => KEY_HEADERS.has(c));

const COURSE_CODE = ["Mã HP", "Mã học phần", "Course code", "courseCode"];
const PLO_RE = /^plo\s*\d+/;
// Description column of a PLO sheet: the template's "Mô tả" plus wordings found in faculty files.
const PLO_DESC = ["Mô tả chuẩn đầu ra", "Mô tả", "Description", "Nội dung", "Nội dung PLO", "Phát biểu PLO", "Phát biểu chuẩn đầu ra", "Phát biểu", "Statement"];

function category(v: string): string | null {
  const n = norm(v);
  if (!n) return null;
  if (/knowledge|kien thuc/.test(n)) return "knowledge";
  if (/skill|ky nang/.test(n)) return "skill";
  if (/autonomy|tu chu|trach nhiem|thai do|attitude/.test(n)) return "autonomy";
  return null;
}
function courseType(v: string): string | null {
  const n = norm(v);
  if (!n) return null;
  if (/elective|tu chon/.test(n)) return "elective";
  if (/general|dai cuong/.test(n)) return "general";
  if (/core|bat buoc|compulsory/.test(n)) return "core";
  return null;
}
export function parseLevel(v: unknown): ContributionLevel | null | "invalid" {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  if (raw === "✓" || raw === "✔") return ContributionLevel.INTRODUCED;
  const n = norm(raw);
  const tokens = new Set(n.split(" "));
  // "I, R" or "I/R/M" → the highest level present.
  if (tokens.has("m") || tokens.has("3") || tokens.has("mastered") || n.includes("thanh thao")) return ContributionLevel.MASTERED;
  if (tokens.has("r") || tokens.has("2") || tokens.has("reinforced") || n.includes("cung co")) return ContributionLevel.REINFORCED;
  if (tokens.has("i") || tokens.has("1") || tokens.has("x") || tokens.has("introduced") || n.includes("gioi thieu")) return ContributionLevel.INTRODUCED;
  return "invalid";
}
function strength(v: string): CloPloStrength {
  const n = norm(v);
  if (/high|cao|manh|\bm\b/.test(n)) return CloPloStrength.HIGH;
  if (/low|thap|yeu/.test(n)) return CloPloStrength.LOW;
  return CloPloStrength.MEDIUM;
}
const ploCode = (s: string) => {
  const m = /plo\s*0*(\d+)/i.exec(s);
  return m ? `PLO${m[1]}` : s.trim().toUpperCase();
};

function classify(t: SheetTable): "matrix" | "clo" | "course" | "plo" | "pi" | null {
  const H = t.headers.map(norm);
  const hasCourse = findCol(t.headers, COURSE_CODE) >= 0;
  if (hasCourse && H.some((h) => PLO_RE.test(h))) return "matrix";
  if (H.some((h) => h === "ma clo" || h === "clo code" || h === "clo")) return "clo";
  if (hasCourse) return "course";
  if (H.some((h) => h === "ma pi" || h === "pi")) return "pi";
  if (findCol(t.headers, ["Mã", "Mã PLO", "PLO", "Code"], { exact: true }) >= 0 && findCol(t.headers, PLO_DESC) >= 0) return "plo";
  return null;
}

export async function parseStructureFiles(
  files: Array<{ name: string; buffer: Buffer }>,
  opts: { skip?: string[] } = {},
): Promise<StructurePlan> {
  const skip = new Set(opts.skip ?? []);
  const plan: StructurePlan = { courses: [], plos: [], matrix: [], clos: [], issues: [], sheets: [], info: null };
  for (const f of files) {
    let tables: SheetTable[];
    try {
      tables = await readTables(f, isHeader);
    } catch {
      plan.issues.push({ where: f.name, message: "Không đọc được tệp (hỏng hoặc không phải Excel/CSV/Word).", level: "error" });
      continue;
    }
    if (/\.docx$/i.test(f.name)) {
      const doc = await readDocx(f.buffer);
      const info = extractProgramInfo(doc);
      if (!plan.info && infoScore(info) >= 2) plan.info = { ...info, file: f.name };
      // PLOs written as paragraphs ("PLO1: …") when the document has no PLO table.
      const hasPloTable = tables.some((t) => classify(t) === "plo");
      const where = `${f.name} › Đoạn văn PLO`;
      if (!hasPloTable) {
        const rows = doc.paragraphs.flatMap((p) => p.split("\n")).map((l) => /^\s*(PLO\s*\d+)\s*[:.–\-)]\s*(.+)$/i.exec(l)).filter((m): m is RegExpExecArray => !!m);
        if (rows.length) {
          const skipped = skip.has(where);
          plan.sheets.push({ where, kind: "plo", rows: rows.length, skipped: skipped || undefined });
          if (!skipped) for (const m of rows) plan.plos.push({ code: ploCode(m[1]), description: m[2].trim(), category: null });
        }
      }
    }
    for (const t of tables) {
      const kind = classify(t);
      const where = `${t.file} › ${t.sheet}`;
      if (!kind) continue;
      if (skip.has(where)) {
        plan.sheets.push({ where, kind, rows: t.rows.length, skipped: true });
        continue;
      }
      plan.sheets.push({ where, kind, rows: t.rows.length });
      if (kind === "pi") {
        plan.issues.push({ where, message: "Sheet chỉ báo PI chỉ để tham khảo – hệ thống chưa lưu PI nên bỏ qua.", level: "warning" });
        continue;
      }
      const at = (r: number) => `${where} › dòng ${r}`;
      if (kind === "course") {
        const cCode = findCol(t.headers, COURSE_CODE);
        const cName = findCol(t.headers, ["Tên học phần", "Tên HP", "Tên tiếng Việt", "Course name", "nameVi", "Tên"]);
        const cEn = findCol(t.headers, ["Tên tiếng Anh", "English name", "nameEn"]);
        const cCr = findCol(t.headers, ["Số TC", "Số tín chỉ", "Tín chỉ", "TC", "Credits"]);
        const cSem = findCol(t.headers, ["Học kỳ", "HK", "Semester"]);
        const cType = findCol(t.headers, ["Loại (type)", "Loại", "Type", "Loại học phần", "Tính chất"]);
        for (const r of t.rows) {
          const code = str(r.cells[cCode]).toUpperCase();
          const nameVi = cName >= 0 ? str(r.cells[cName]) : "";
          if (!code && !nameVi) continue;
          if (!code || !nameVi) { plan.issues.push({ where: at(r.rowNumber), message: "Thiếu mã hoặc tên học phần.", level: "error" }); continue; }
          const credits = cCr >= 0 ? int(r.cells[cCr]) : null;
          if (credits != null && (credits < 0 || credits > 30)) plan.issues.push({ where: at(r.rowNumber), message: `Số tín chỉ ${credits} bất thường.`, level: "warning" });
          plan.courses.push({ code, nameVi, nameEn: cEn >= 0 ? str(r.cells[cEn]) || null : null, credits: credits ?? 3, semester: cSem >= 0 ? int(r.cells[cSem]) : null, type: cType >= 0 ? courseType(str(r.cells[cType])) : null });
        }
      } else if (kind === "plo") {
        const cCode = findCol(t.headers, ["Mã PLO", "Mã", "PLO", "Code"], { exact: true });
        const cDesc = findCol(t.headers, PLO_DESC);
        const cCat = findCol(t.headers, ["Nhóm (category)", "Category", "Nhóm", "Loại"]);
        for (const r of t.rows) {
          const code = ploCode(str(r.cells[cCode]));
          const description = str(r.cells[cDesc]);
          if (!code && !description) continue;
          if (!code || !description) { plan.issues.push({ where: at(r.rowNumber), message: "Thiếu mã hoặc mô tả PLO.", level: "error" }); continue; }
          plan.plos.push({ code, description, category: cCat >= 0 ? category(str(r.cells[cCat])) : null });
        }
      } else if (kind === "matrix") {
        const cCode = findCol(t.headers, COURSE_CODE);
        const ploCols = t.headers.map((h, i) => ({ h, i })).filter((x) => PLO_RE.test(norm(x.h)));
        for (const r of t.rows) {
          const courseCode = str(r.cells[cCode]).toUpperCase();
          if (!courseCode) continue;
          const cells: MatrixRow["cells"] = [];
          for (const pc of ploCols) {
            const lv = parseLevel(r.cells[pc.i]);
            if (lv === "invalid") { plan.issues.push({ where: at(r.rowNumber), message: `Ô ${pc.h} = "${r.cells[pc.i]}" không phải I/R/M – bỏ qua.`, level: "warning" }); continue; }
            cells.push({ ploCode: ploCode(pc.h), level: lv });
          }
          plan.matrix.push({ courseCode, cells });
        }
      } else if (kind === "clo") {
        const cCourse = findCol(t.headers, COURSE_CODE);
        const cCode = findCol(t.headers, ["Mã CLO", "CLO", "CLO code"]);
        const cDesc = findCol(t.headers, ["Mô tả", "Mô tả CLO", "Description", "Nội dung"]);
        const cPlo = findCol(t.headers, ["PLO liên kết", "PLO", "Liên kết PLO", "PLOs"]);
        const cStr = findCol(t.headers, ["Mức đóng góp", "Mức", "Strength", "Mức độ"]);
        for (const r of t.rows) {
          const courseCode = str(r.cells[cCourse]).toUpperCase();
          const code = str(r.cells[cCode]).toUpperCase().replace(/\s+/g, "");
          const description = str(r.cells[cDesc]);
          if (!courseCode && !code) continue;
          if (!courseCode || !code || !description) { plan.issues.push({ where: at(r.rowNumber), message: "Thiếu mã học phần, mã CLO hoặc mô tả.", level: "error" }); continue; }
          const plos = cPlo >= 0 ? (str(r.cells[cPlo]).match(/plo\s*\d+/gi) ?? []).map(ploCode) : [];
          plan.clos.push({ courseCode, code, description, plos, strength: cStr >= 0 ? strength(str(r.cells[cStr])) : CloPloStrength.MEDIUM });
        }
      }
    }
  }
  // Duplicates inside the upload: last one wins, but tell the user.
  const dedupe = <T,>(arr: T[], key: (x: T) => string, label: string) => {
    const seen = new Map<string, T>();
    for (const x of arr) {
      if (seen.has(key(x))) plan.issues.push({ where: label, message: `Trùng ${key(x)} – dùng dòng sau cùng.`, level: "warning" });
      seen.set(key(x), x);
    }
    return [...seen.values()];
  };
  plan.courses = dedupe(plan.courses, (c) => c.code, "Học phần");
  plan.plos = dedupe(plan.plos, (p) => p.code, "PLO");
  plan.matrix = dedupe(plan.matrix, (m) => m.courseCode, "Ma trận");
  plan.clos = dedupe(plan.clos, (c) => `${c.courseCode}/${c.code}`, "CLO");
  // Several sheets of the same kind: rows with the same code are overwritten by the later sheet.
  const KIND_NAME = { course: "học phần", matrix: "ma trận", clo: "CLO" } as const;
  for (const kind of ["course", "matrix", "clo"] as const) {
    const used = plan.sheets.filter((x) => x.kind === kind && !x.skipped);
    if (used.length > 1)
      plan.issues.unshift({
        where: used.map((x) => x.where).join(" + "),
        message: `Có ${used.length} sheet ${KIND_NAME[kind]}; mã trùng sẽ lấy theo sheet sau cùng (${used[used.length - 1].where}). Bỏ chọn sheet không dùng ở danh sách sheet bên trên.`,
        level: "warning",
      });
  }
  if (!plan.sheets.length && !plan.info)
    plan.issues.push({ where: "Tệp tải lên", message: "Không tìm thấy bảng học phần, PLO, ma trận hoặc CLO. Hãy dùng tệp mẫu (Excel) hoặc đặt dữ liệu trong bảng Word có dòng tiêu đề (Mã HP, Tên học phần…).", level: "error" });
  return plan;
}

/** Compare the plan with the database: counts, and references that cannot be resolved. */
export async function previewStructure(programId: string, plan: StructurePlan): Promise<StructurePreview> {
  const [courses, plos] = await Promise.all([
    prisma.course.findMany({ where: { programId }, select: { id: true, code: true, clos: { select: { code: true } } } }),
    prisma.plo.findMany({ where: { programId }, select: { code: true } }),
  ]);
  const courseCodes = new Set([...courses.map((c) => c.code), ...plan.courses.map((c) => c.code)]);
  const ploCodes = new Set([...plos.map((p) => p.code), ...plan.plos.map((p) => p.code)]);
  const existingCourse = new Set(courses.map((c) => c.code));
  const existingPlo = new Set(plos.map((p) => p.code));
  const existingClo = new Set(courses.flatMap((c) => c.clos.map((k) => `${c.code}/${k.code}`)));
  if (plan.matrix.length && ploCodes.size === 0)
    plan.issues.unshift({
      where: "PLO",
      message: "Chương trình chưa có PLO và tệp không có sheet PLO nhận được (cột Mã + Mô tả/Phát biểu), nên toàn bộ ma trận sẽ bị bỏ qua. Thêm sheet PLO hoặc nhập PLO trước.",
      level: "error",
    });
  let cells = 0;
  for (const m of plan.matrix) {
    if (!courseCodes.has(m.courseCode)) plan.issues.push({ where: "Ma trận", message: `Học phần ${m.courseCode} chưa có – dòng ma trận sẽ bị bỏ qua.`, level: "error" });
    for (const c of m.cells) if (!ploCodes.has(c.ploCode)) plan.issues.push({ where: "Ma trận", message: `${c.ploCode} chưa có trong chương trình – cột sẽ bị bỏ qua.`, level: "error" });
    cells += m.cells.filter((c) => c.level).length;
  }
  for (const c of plan.clos) {
    if (!courseCodes.has(c.courseCode)) plan.issues.push({ where: "CLO", message: `Học phần ${c.courseCode} chưa có – CLO ${c.code} sẽ bị bỏ qua.`, level: "error" });
    for (const p of c.plos) if (!ploCodes.has(p)) plan.issues.push({ where: "CLO", message: `${c.courseCode}/${c.code}: ${p} chưa có.`, level: "warning" });
  }
  plan.issues = plan.issues.filter((x, i, a) => a.findIndex((y) => y.where === x.where && y.message === x.message) === i);
  return {
    plan,
    infoChanges: await infoChanges(programId, plan),
    counts: {
      courses: { create: plan.courses.filter((c) => !existingCourse.has(c.code)).length, update: plan.courses.filter((c) => existingCourse.has(c.code)).length },
      plos: { create: plan.plos.filter((p) => !existingPlo.has(p.code)).length, update: plan.plos.filter((p) => existingPlo.has(p.code)).length },
      matrixCells: { create: cells, update: 0 },
      clos: { create: plan.clos.filter((c) => !existingClo.has(`${c.courseCode}/${c.code}`)).length, update: plan.clos.filter((c) => existingClo.has(`${c.courseCode}/${c.code}`)).length },
    },
  };
}

const DEGREE_LABEL: Record<string, string> = { BACHELOR: "Đại học", MASTER: "Thạc sĩ", DOCTORATE: "Tiến sĩ" };

/** Field-by-field changes the Word declaration would make to the program (code and faculty are never changed). */
async function infoChanges(programId: string, plan: StructurePlan): Promise<ProgramInfoChange[]> {
  const i = plan.info;
  if (!i) return [];
  const p = await prisma.program.findUnique({ where: { id: programId }, include: { versions: { select: { versionLabel: true } } } });
  if (!p) return [];
  const out: ProgramInfoChange[] = [];
  const add = (field: string, label: string, current: string | null | undefined, next: string | null | undefined) => {
    if (next && next.trim() !== (current ?? "").trim()) out.push({ field, label, current: current ?? "", next });
  };
  add("nameVi", "Tên chương trình", p.nameVi, i.nameVi);
  add("nameEn", "Tên tiếng Anh", p.nameEn, i.nameEn);
  add("degreeLevel", "Trình độ", DEGREE_LABEL[p.degreeLevel], i.degreeLevel ? DEGREE_LABEL[i.degreeLevel] : null);
  add("totalCredits", "Tổng số tín chỉ", p.totalCredits?.toString(), i.totalCredits?.toString());
  add("objectives", "Mục tiêu đào tạo", p.objectives, composeObjectives(i));
  add("description", "Mô tả", p.description, composeDescription(i));
  if (i.versionLabel && !p.versions.some((v) => v.versionLabel === i.versionLabel))
    out.push({ field: "version", label: "Phiên bản chương trình", current: "", next: `Tạo phiên bản ${i.versionLabel}${i.versionSummary ? ` (${i.versionSummary})` : ""}` });
  if (i.code && i.code !== p.code)
    plan.issues.push({ where: plan.info!.file, message: `Mã chương trình trong tệp (${i.code}) khác mã đang nhập (${p.code}) — kiểm tra lại đúng tệp chưa. Mã chương trình không bị thay đổi.`, level: "warning" });
  return out;
}

/** Write the plan. Matrix rows replace that course's whole row (blank cells remove old links). */
export async function applyStructure(programId: string, plan: StructurePlan, opts: { info?: boolean } = {}) {
  return prisma.$transaction(
    async (tx) => {
      let infoUpdated = 0;
      const i = plan.info;
      if (opts.info && i) {
        const data = {
          ...(i.nameVi ? { nameVi: i.nameVi } : {}),
          ...(i.nameEn ? { nameEn: i.nameEn } : {}),
          ...(i.degreeLevel ? { degreeLevel: i.degreeLevel } : {}),
          ...(i.totalCredits ? { totalCredits: i.totalCredits } : {}),
          ...(composeObjectives(i) ? { objectives: composeObjectives(i) } : {}),
          ...(composeDescription(i) ? { description: composeDescription(i) } : {}),
        };
        if (Object.keys(data).length) {
          await tx.program.update({ where: { id: programId }, data });
          infoUpdated = Object.keys(data).length;
        }
        if (i.versionLabel && i.versionYear) {
          const exists = await tx.programVersion.findUnique({ where: { programId_versionLabel: { programId, versionLabel: i.versionLabel } } });
          if (!exists) {
            await tx.programVersion.create({ data: { programId, versionLabel: i.versionLabel, year: i.versionYear, summary: i.versionSummary } });
            infoUpdated++;
          }
        }
      }
      for (const c of plan.courses) {
        await tx.course.upsert({
          where: { programId_code: { programId, code: c.code } },
          update: { nameVi: c.nameVi, nameEn: c.nameEn ?? undefined, credits: c.credits, semester: c.semester, type: c.type ?? undefined },
          create: { programId, code: c.code, nameVi: c.nameVi, nameEn: c.nameEn, credits: c.credits, semester: c.semester, type: c.type },
        });
      }
      for (const p of plan.plos) {
        await tx.plo.upsert({
          where: { programId_code: { programId, code: p.code } },
          update: { description: p.description, category: p.category ?? undefined },
          create: { programId, code: p.code, description: p.description, category: p.category },
        });
      }
      const courseId = new Map((await tx.course.findMany({ where: { programId }, select: { id: true, code: true } })).map((c) => [c.code, c.id]));
      const ploId = new Map((await tx.plo.findMany({ where: { programId }, select: { id: true, code: true } })).map((p) => [p.code, p.id]));
      let cells = 0;
      for (const m of plan.matrix) {
        const cid = courseId.get(m.courseCode);
        if (!cid) continue;
        for (const cell of m.cells) {
          const pid = ploId.get(cell.ploCode);
          if (!pid) continue;
          if (cell.level) {
            await tx.curriculumMap.upsert({ where: { courseId_ploId: { courseId: cid, ploId: pid } }, update: { level: cell.level }, create: { programId, courseId: cid, ploId: pid, level: cell.level } });
            cells++;
          } else await tx.curriculumMap.deleteMany({ where: { courseId: cid, ploId: pid } });
        }
      }
      let clos = 0;
      for (const c of plan.clos) {
        const cid = courseId.get(c.courseCode);
        if (!cid) continue;
        const clo = await tx.clo.upsert({ where: { courseId_code: { courseId: cid, code: c.code } }, update: { description: c.description }, create: { courseId: cid, code: c.code, description: c.description } });
        await tx.cloPloLink.deleteMany({ where: { cloId: clo.id } });
        for (const p of c.plos) {
          const pid = ploId.get(p);
          if (pid) await tx.cloPloLink.create({ data: { cloId: clo.id, ploId: pid, strength: c.strength } });
        }
        clos++;
      }
      return { courses: plan.courses.length, plos: plan.plos.length, matrixCells: cells, clos, infoUpdated };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}
