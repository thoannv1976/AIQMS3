// Import outcome-attainment (OBE) results from Excel: % of students achieving each PLO (or CLO),
// by measurement period (semester) or graduating cohort. Feeds the "Đạt chuẩn đầu ra (OBE)" screen.
import { prisma } from "@/lib/db";
import { readTables, findCol, norm, str, type Cell, type SheetTable } from "./sheet";
import type { ImportIssue } from "./program-structure";

export interface ObeRow {
  ploCode: string | null;
  cloCode: string | null;
  courseCode: string | null;
  cohort: string | null;
  semester: string | null;
  achievedRate: number;
  threshold: number;
  sampleSize: number | null;
}

export interface ObePlan {
  rows: ObeRow[];
  issues: ImportIssue[];
  sheets: Array<{ where: string; kind: string; rows: number; skipped?: boolean }>;
}

export interface ObePreview {
  plan: ObePlan;
  existing: number;
  counts: { create: number; update: number };
  periods: string[];
  below: string[];
}

const PLO = ["PLO", "Mã PLO", "Chuẩn đầu ra", "PLO code"];
const CLO = ["CLO", "Mã CLO", "CLO code"];
const COURSE = ["Mã HP", "Mã học phần", "Học phần điểm đo", "Học phần", "Course code"];
const SEMESTER = ["Kỳ đo", "Học kỳ", "Kỳ", "Đợt đo", "Semester", "Period"];
const COHORT = ["Khóa", "Khóa tốt nghiệp", "Khóa học", "Cohort"];
const RATE = ["% đạt", "Tỷ lệ đạt", "Tỉ lệ đạt", "Tỷ lệ đạt (%)", "Tỉ lệ đạt (%)", "Achieved", "Achieved rate", "Rate"];
const THRESHOLD = ["Ngưỡng %", "Ngưỡng", "Ngưỡng (%)", "Mục tiêu", "Threshold", "Target"];
const MEASURED = ["Số SV được đo", "Số SV", "Cỡ mẫu", "Số người học", "n", "Sample", "Sample size"];
const ACHIEVED = ["Số SV đạt", "Số đạt", "Achieved count"];

const isHeader = (cells: string[]) => cells.includes("plo") || cells.includes("ma plo") || cells.includes("clo") || cells.includes("ma clo");

const num = (c: Cell | undefined): number | null => {
  if (c == null || c === "") return null;
  if (typeof c === "number") return c;
  const n = Number(String(c).replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
};
const code = (s: string, prefix: "PLO" | "CLO") => {
  const m = new RegExp(`${prefix}\\s*0*(\\d+)`, "i").exec(s);
  return m ? `${prefix}${m[1]}` : s.trim().toUpperCase() || null;
};

function classify(t: SheetTable): "obe" | "pi" | null {
  const H = t.headers.map(norm);
  if (H.some((h) => h === "pi" || h === "ma pi")) return "pi";
  const hasTarget = findCol(t.headers, PLO, { exact: true }) >= 0 || findCol(t.headers, CLO, { exact: true }) >= 0;
  const hasRate = findCol(t.headers, RATE) >= 0 || (findCol(t.headers, ACHIEVED) >= 0 && findCol(t.headers, MEASURED, { exact: true }) >= 0);
  const hasPeriod = findCol(t.headers, SEMESTER) >= 0 || findCol(t.headers, COHORT) >= 0;
  return hasTarget && hasRate && hasPeriod ? "obe" : null;
}

const keyOf = (r: Pick<ObeRow, "ploCode" | "cloCode" | "courseCode" | "cohort" | "semester">) =>
  [r.ploCode, r.cloCode, r.courseCode, r.cohort, r.semester].map((x) => x ?? "").join("|");

export async function parseObeFiles(files: Array<{ name: string; buffer: Buffer }>, opts: { skip?: string[] } = {}): Promise<ObePlan> {
  const skip = new Set(opts.skip ?? []);
  const plan: ObePlan = { rows: [], issues: [], sheets: [] };
  for (const f of files) {
    let tables: SheetTable[];
    try {
      tables = await readTables(f, isHeader);
    } catch {
      plan.issues.push({ where: f.name, message: "Không đọc được tệp (hỏng hoặc không phải Excel/CSV).", level: "error" });
      continue;
    }
    for (const t of tables) {
      const kind = classify(t);
      if (!kind) continue;
      const where = `${t.file} › ${t.sheet}`;
      if (kind === "pi") {
        plan.sheets.push({ where, kind, rows: t.rows.length, skipped: true });
        plan.issues.push({ where, message: "Sheet theo chỉ báo PI – hệ thống lưu mức đạt theo PLO/CLO nên bỏ qua.", level: "warning" });
        continue;
      }
      if (skip.has(where)) {
        plan.sheets.push({ where, kind, rows: t.rows.length, skipped: true });
        continue;
      }
      plan.sheets.push({ where, kind, rows: t.rows.length });
      const col = {
        plo: findCol(t.headers, PLO, { exact: true }),
        clo: findCol(t.headers, CLO, { exact: true }),
        course: findCol(t.headers, COURSE),
        sem: findCol(t.headers, SEMESTER),
        cohort: findCol(t.headers, COHORT),
        rate: findCol(t.headers, RATE),
        thr: findCol(t.headers, THRESHOLD),
        n: findCol(t.headers, MEASURED, { exact: true }),
        ok: findCol(t.headers, ACHIEVED),
      };
      for (const r of t.rows) {
        const at = `${where} › dòng ${r.rowNumber}`;
        const ploCode = col.plo >= 0 && str(r.cells[col.plo]) ? code(str(r.cells[col.plo]), "PLO") : null;
        const cloCode = col.clo >= 0 && str(r.cells[col.clo]) ? code(str(r.cells[col.clo]), "CLO") : null;
        if (!ploCode && !cloCode) continue;
        const n = col.n >= 0 ? num(r.cells[col.n]) : null;
        const achievedCount = col.ok >= 0 ? num(r.cells[col.ok]) : null;
        let rate = col.rate >= 0 ? num(r.cells[col.rate]) : null;
        if (rate == null && n && achievedCount != null) rate = (achievedCount / n) * 100;
        if (rate != null && rate > 0 && rate <= 1 && col.rate >= 0 && !/%/.test(String(r.cells[col.rate]))) rate *= 100; // 0.83 → 83
        if (rate == null || rate < 0 || rate > 100) {
          plan.issues.push({ where: at, message: "Thiếu hoặc sai tỷ lệ đạt (0–100%).", level: "error" });
          continue;
        }
        const semester = col.sem >= 0 ? str(r.cells[col.sem]) || null : null;
        const cohort = col.cohort >= 0 ? str(r.cells[col.cohort]) || null : null;
        if (!semester && !cohort) {
          plan.issues.push({ where: at, message: "Thiếu kỳ đo hoặc khóa.", level: "error" });
          continue;
        }
        const thr = col.thr >= 0 ? num(r.cells[col.thr]) : null;
        plan.rows.push({
          ploCode,
          cloCode,
          courseCode: col.course >= 0 ? str(r.cells[col.course]).toUpperCase() || null : null,
          cohort,
          semester,
          achievedRate: Math.round(rate * 10) / 10,
          threshold: thr != null && thr > 0 && thr <= 100 ? thr : 70,
          sampleSize: n != null ? Math.round(n) : null,
        });
      }
    }
  }
  const seen = new Map<string, ObeRow>();
  for (const r of plan.rows) {
    if (seen.has(keyOf(r))) plan.issues.push({ where: "Dữ liệu", message: `Trùng ${r.ploCode ?? r.cloCode} · ${r.semester ?? r.cohort} – dùng dòng sau cùng.`, level: "warning" });
    seen.set(keyOf(r), r);
  }
  plan.rows = [...seen.values()];
  if (!plan.sheets.some((s) => s.kind === "obe"))
    plan.issues.push({ where: "Tệp tải lên", message: "Không tìm thấy sheet có cột PLO (hoặc CLO), Kỳ đo/Khóa và % đạt.", level: "error" });
  return plan;
}

export async function previewObe(programId: string, plan: ObePlan): Promise<ObePreview> {
  const [existing, plos] = await Promise.all([
    prisma.outcomeAssessment.findMany({ where: { programId }, select: { ploCode: true, cloCode: true, courseCode: true, cohort: true, semester: true } }),
    prisma.plo.findMany({ where: { programId }, select: { code: true } }),
  ]);
  const have = new Set(existing.map(keyOf));
  const known = new Set(plos.map((p) => p.code));
  const unknown = [...new Set(plan.rows.map((r) => r.ploCode).filter((c): c is string => Boolean(c) && !known.has(c!)))];
  if (unknown.length && known.size)
    plan.issues.push({ where: "PLO", message: `${unknown.join(", ")} chưa có trong chương trình – vẫn nhập, nhưng nên kiểm tra mã.`, level: "warning" });
  const periods = [...new Set(plan.rows.map((r) => r.semester ?? r.cohort ?? ""))].filter(Boolean);
  const below = plan.rows.filter((r) => r.achievedRate < r.threshold).map((r) => `${r.ploCode ?? r.cloCode} (${r.semester ?? r.cohort}: ${r.achievedRate}%)`);
  return {
    plan,
    existing: existing.length,
    counts: { create: plan.rows.filter((r) => !have.has(keyOf(r))).length, update: plan.rows.filter((r) => have.has(keyOf(r))).length },
    periods,
    below,
  };
}

/** Upsert by (PLO, CLO, course, cohort, period); `replace` first deletes all OBE rows of the program. */
export async function applyObe(programId: string, plan: ObePlan, opts: { replace?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    let removed = 0;
    if (opts.replace) removed = (await tx.outcomeAssessment.deleteMany({ where: { programId } })).count;
    const existing = await tx.outcomeAssessment.findMany({
      where: { programId },
      select: { id: true, ploCode: true, cloCode: true, courseCode: true, cohort: true, semester: true },
    });
    const idByKey = new Map(existing.map((e) => [keyOf(e), e.id]));
    let created = 0;
    let updated = 0;
    for (const r of plan.rows) {
      const data = { achievedRate: r.achievedRate, threshold: r.threshold, sampleSize: r.sampleSize };
      const id = idByKey.get(keyOf(r));
      if (id) {
        await tx.outcomeAssessment.update({ where: { id }, data });
        updated++;
      } else {
        await tx.outcomeAssessment.create({ data: { programId, ploCode: r.ploCode, cloCode: r.cloCode, courseCode: r.courseCode, cohort: r.cohort, semester: r.semester, ...data } });
        created++;
      }
    }
    return { created, updated, removed };
  }, { timeout: 60_000 });
}
