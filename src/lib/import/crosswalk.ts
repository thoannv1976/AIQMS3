// N5 – Crosswalk evidence between accreditation standard sets (e.g. TT04/2016 or AUN-QA → TT04/2025).
// 1. Parse a mapping workbook. Two real-world shapes are accepted:
//    - criterion level: "Tiêu chí cũ" | "Tiêu chí mới" (new cell may hold "1.4; 2.1")
//    - evidence level:  "Mã cũ (TT04/2016)" = 1.2.04 | "Mã mới (TT04/2025)" = MC-1.2.02 | "Tiêu chí chính" | "Tiêu chí phụ"
// 2. Plan: for every visible evidence of the program work out old criterion → new criteria (+ new code).
// 3. Apply: add links to the new criteria and, optionally, renumber evidence codes (two-phase, in one transaction).
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseEvidenceFilename } from "@/lib/evidence/filename";
import { readTables, findCol, str, type SheetTable } from "./sheet";

// ----------------------------------------------------------------------------- codes

/** "MC-1.02.01b" → ["1","2","1b"]; "E-2.3-04" → ["2","3","4"]; "1.1" → ["1","1"]; null when no dotted number. */
function segmentsOf(raw: string): string[] | null {
  const s = raw.trim().replace(/(\d)[\s_\-]+(?=\d)/g, "$1.");
  const m = s.match(/\d+(?:\.\d+[a-z]?)+/i);
  if (!m) return null;
  return m[0].split(".").map((p) => {
    const mm = /^(\d+)([a-z]?)$/i.exec(p);
    return mm ? String(Number(mm[1])) + mm[2].toLowerCase() : p.toLowerCase();
  });
}

/** Normalised criterion code ("01.1" → "1.1"), or null if the text is not a criterion code. */
export function criterionKey(raw: string): string | null {
  const seg = segmentsOf(raw);
  return seg && seg.length === 2 ? seg.join(".") : null;
}

/** Normalised evidence key ("MC-1.1.01" / "MC_1.1.01" / "1.1.01" → "1.1.1"), or null. */
export function evidenceKey(raw: string): string | null {
  const seg = segmentsOf(raw);
  return seg && seg.length >= 3 ? seg.join(".") : null;
}

/** Old criterion of an evidence parsed from its code (MC-x.y.zz → "x.y", E-x.y-zz, H1.xx.yy.zz …). */
export function criterionFromEvidenceCode(code: string): string | null {
  // parseEvidenceFilename strips a trailing ".ext" — give it a dummy one so ".01" survives.
  const c = parseEvidenceFilename(`${code}.pdf`).criterionCode;
  return c ? criterionKey(c) : null;
}

const naturalCmp = (a: string, b: string) => a.localeCompare(b, "vi", { numeric: true, sensitivity: "base" });
const splitList = (s: string) => s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

function formatNewCode(raw: string): string | null {
  const t = raw.trim();
  if (!evidenceKey(t)) return null;
  if (/^\d/.test(t)) return `MC-${t}`;
  const p = parseEvidenceFilename(`${t}.pdf`);
  return p.criterionCode ? p.code : t.toUpperCase();
}

// ----------------------------------------------------------------------------- mapping file

export interface CriterionMapping { old: string; newCriteria: string[] }
export interface EvidenceMapping { old: string; raw: string; newCriteria: string[]; newCode: string | null }
export interface CrosswalkIssue { where: string; message: string }

export interface CrosswalkMappingFile {
  criterion: CriterionMapping[];
  evidence: EvidenceMapping[];
  issues: CrosswalkIssue[];
  sheets: Array<{ where: string; rows: number }>;
  /** Rows without an old code (e.g. newly added documents) – ignored. */
  skippedNoOld: number;
}

const OLD = ["Tiêu chí cũ", "Mã tiêu chí cũ", "Mã cũ", "Old criterion", "Old criteria", "Old code"];
const NEW_CRIT = ["Tiêu chí mới", "Mã tiêu chí mới", "New criterion", "New criteria"];
const PRIMARY = ["Tiêu chí chính", "Primary criterion"];
const SECONDARY = ["Tiêu chí phụ", "Tiêu chí liên quan", "Secondary criteria"];
const NEW_CODE = ["Mã mới", "New code"];

const isHeader = (cells: string[]) =>
  findCol(cells, OLD) >= 0 && (findCol(cells, NEW_CRIT) >= 0 || findCol(cells, PRIMARY) >= 0 || findCol(cells, NEW_CODE) >= 0);

function parseTable(t: SheetTable, out: CrosswalkMappingFile, crit: Map<string, string[]>, ev: Map<string, EvidenceMapping>) {
  const where = `${t.file} › ${t.sheet}`;
  const iOld = findCol(t.headers, OLD);
  const iNewCrit = findCol(t.headers, NEW_CRIT);
  const iPrimary = findCol(t.headers, PRIMARY);
  const iSecondary = findCol(t.headers, SECONDARY);
  const iNewCode = findCol(t.headers, NEW_CODE);
  let used = 0;
  for (const r of t.rows) {
    const at = `${where} dòng ${r.rowNumber}`;
    const oldRaw = str(r.cells[iOld]);
    if (!oldRaw) {
      out.skippedNoOld++;
      continue;
    }
    // New criteria: explicit column > primary + secondary > derived from the new evidence code.
    let tokens: string[] = [];
    let newCode: string | null = null;
    if (iNewCrit >= 0) tokens = splitList(str(r.cells[iNewCrit]));
    else if (iPrimary >= 0) tokens = [...splitList(str(r.cells[iPrimary])), ...(iSecondary >= 0 ? splitList(str(r.cells[iSecondary])) : [])];
    const codeTokens = iNewCode >= 0 ? splitList(str(r.cells[iNewCode])) : [];
    if (iNewCrit < 0 && iPrimary < 0) tokens = codeTokens;
    const newCriteria: string[] = [];
    for (const tok of tokens) {
      const seg = segmentsOf(tok);
      if (!seg) {
        out.issues.push({ where: at, message: `Không đọc được mã tiêu chí mới "${tok}"` });
        continue;
      }
      newCriteria.push(seg.slice(0, 2).join("."));
      if (seg.length >= 3 && !newCode) newCode = formatNewCode(tok);
    }
    if (!newCode && codeTokens.length) newCode = formatNewCode(codeTokens[0]);
    const targets = uniq(newCriteria);
    if (!targets.length) {
      out.issues.push({ where: at, message: `Không có tiêu chí mới cho "${oldRaw}"` });
      continue;
    }
    for (const o of splitList(oldRaw)) {
      const ck = criterionKey(o);
      const ek = ck ? null : evidenceKey(o);
      if (ck) {
        crit.set(ck, uniq([...(crit.get(ck) ?? []), ...targets]));
        used++;
      } else if (ek) {
        const prev = ev.get(ek);
        if (prev) {
          if (prev.newCode !== newCode || prev.newCriteria.join() !== targets.join())
            out.issues.push({ where: at, message: `Mã cũ ${o} xuất hiện nhiều lần — giữ dòng đầu tiên` });
          continue;
        }
        ev.set(ek, { old: ek, raw: o, newCriteria: targets, newCode });
        used++;
      } else out.issues.push({ where: at, message: `Không đọc được mã cũ "${o}"` });
    }
  }
  out.sheets.push({ where, rows: used });
}

export async function parseCrosswalkFiles(files: Array<{ name: string; buffer: Buffer }>): Promise<CrosswalkMappingFile> {
  const out: CrosswalkMappingFile = { criterion: [], evidence: [], issues: [], sheets: [], skippedNoOld: 0 };
  const crit = new Map<string, string[]>();
  const ev = new Map<string, EvidenceMapping>();
  for (const f of files) {
    const tables = await readTables(f, isHeader);
    if (!tables.length) out.issues.push({ where: f.name, message: 'Không tìm thấy bảng có cột "Tiêu chí cũ"/"Mã cũ" và "Tiêu chí mới"/"Mã mới"' });
    for (const t of tables) parseTable(t, out, crit, ev);
  }
  out.criterion = [...crit].map(([old, newCriteria]) => ({ old, newCriteria })).sort((a, b) => naturalCmp(a.old, b.old));
  out.evidence = [...ev.values()].sort((a, b) => naturalCmp(a.old, b.old));
  return out;
}

// ----------------------------------------------------------------------------- plan

export interface CrosswalkOptions {
  targetSetId: string;
  source: "file" | "identity";
  oldFrom: "links" | "code";
  sourceSetId: string | null;
  rename: boolean;
}

export interface CrosswalkRow {
  evidenceId: string;
  code: string;
  title: string;
  /** Old criterion code(s), "" when unknown. */
  old: string;
  /** Old evidence code from the mapping file when the row matched on evidence code. */
  matchedCode: string | null;
  newCriteria: string[];
  newCode: string | null;
  addLinks: number;
  warnings: string[];
  skip: boolean;
}

export interface CrosswalkPlan {
  options: CrosswalkOptions;
  targetSet: { id: string; code: string; name: string };
  rows: CrosswalkRow[];
  mapping: { criterion: number; evidence: number; issues: CrosswalkIssue[]; sheets: CrosswalkMappingFile["sheets"]; skippedNoOld: number } | null;
  totals: { evidence: number; ready: number; skipped: number; linksToAdd: number; renamed: number; warnings: number };
  /** Server-only details used by apply. */
  work: Array<{ evidenceId: string; note: string; criterionIds: string[]; newCode: string | null; description: string | null; oldCode: string }>;
}

export async function planCrosswalk(
  programId: string,
  visibility: Prisma.EvidenceWhereInput,
  opts: CrosswalkOptions,
  mapping: CrosswalkMappingFile | null,
): Promise<CrosswalkPlan> {
  const targetSet = await prisma.accreditationStandardSet.findUnique({ where: { id: opts.targetSetId }, select: { id: true, code: true, name: true } });
  if (!targetSet) throw new Error("Không tìm thấy bộ tiêu chuẩn đích.");
  if (opts.oldFrom === "links") {
    if (!opts.sourceSetId) throw new Error("Chọn bộ tiêu chuẩn nguồn.");
    if (!(await prisma.accreditationStandardSet.count({ where: { id: opts.sourceSetId } }))) throw new Error("Không tìm thấy bộ tiêu chuẩn nguồn.");
  }
  if (opts.source === "file" && !mapping) throw new Error("Chọn tệp bảng chuyển mã.");

  const targetCriteria = await prisma.criterion.findMany({ where: { standard: { setId: targetSet.id } }, select: { id: true, code: true } });
  const targetByCode = new Map<string, { id: string; code: string }>();
  for (const c of targetCriteria) targetByCode.set(criterionKey(c.code) ?? c.code, c);

  const critMap = new Map((mapping?.criterion ?? []).map((m) => [m.old, m.newCriteria]));
  const evMap = new Map((mapping?.evidence ?? []).map((m) => [m.old, m]));

  const evidence = await prisma.evidence.findMany({
    where: { AND: [visibility, { programId }] },
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      locked: true,
      criterionLinks: { select: { criterionId: true, criterion: { select: { code: true, standard: { select: { setId: true } } } } } },
    },
  });
  evidence.sort((a, b) => naturalCmp(a.code, b.code));

  type Draft = CrosswalkRow & { targets: Array<{ id: string; code: string }>; explicitCode: string | null; description: string | null };
  const drafts: Draft[] = evidence.map((e) => {
    const warnings: string[] = [];
    const parsed = criterionFromEvidenceCode(e.code);
    let oldCriteria: string[] = [];
    if (opts.oldFrom === "links") {
      oldCriteria = uniq(
        e.criterionLinks.filter((l) => l.criterion.standard.setId === opts.sourceSetId).map((l) => criterionKey(l.criterion.code) ?? l.criterion.code),
      ).sort(naturalCmp);
      if (parsed && oldCriteria.includes(parsed)) oldCriteria = [parsed, ...oldCriteria.filter((c) => c !== parsed)];
    } else if (parsed) oldCriteria = [parsed];

    let wanted: string[] = [];
    let matchedCode: string | null = null;
    let explicitCode: string | null = null;
    const ek = opts.source === "file" ? evidenceKey(e.code) : null;
    const byEvidence = ek ? evMap.get(ek) : undefined;
    if (byEvidence) {
      wanted = byEvidence.newCriteria;
      matchedCode = byEvidence.raw;
      explicitCode = byEvidence.newCode;
    } else if (!oldCriteria.length) {
      warnings.push(opts.oldFrom === "links" ? "Chưa liên kết tiêu chí nào trong bộ nguồn" : "Không đọc được tiêu chí cũ từ mã minh chứng");
    } else {
      for (const c of oldCriteria) {
        const mapped = opts.source === "identity" ? [c] : critMap.get(c);
        if (!mapped?.length) warnings.push(`Tiêu chí cũ ${c} chưa có trong bảng chuyển mã`);
        else wanted.push(...mapped);
      }
      wanted = uniq(wanted);
    }

    const targets: Array<{ id: string; code: string }> = [];
    for (const w of wanted) {
      const t = targetByCode.get(w);
      if (t) targets.push(t);
      else warnings.push(`Không có tiêu chí ${w} trong ${targetSet.code}`);
    }
    if (e.locked) warnings.push("Minh chứng đang khóa — bỏ qua");
    const skip = e.locked || targets.length === 0;
    const linked = new Set(e.criterionLinks.map((l) => l.criterionId));
    return {
      evidenceId: e.id,
      code: e.code,
      title: e.title,
      old: oldCriteria.join(", "),
      matchedCode,
      newCriteria: targets.map((t) => t.code),
      newCode: null,
      addLinks: skip ? 0 : targets.filter((t) => !linked.has(t.id)).length,
      warnings,
      skip,
      targets,
      explicitCode,
      description: e.description,
    };
  });

  // ---- renumbering: MC-<new primary>.<NN>, continuing after codes kept by evidence outside this batch.
  if (opts.rename) {
    const batch = drafts.filter((d) => !d.skip);
    const batchIds = new Set(batch.map((d) => d.evidenceId));
    const all = await prisma.evidence.findMany({ where: { programId }, select: { id: true, code: true } });
    const taken = new Set(all.filter((e) => !batchIds.has(e.id)).map((e) => e.code.toUpperCase()));
    // 1) codes given explicitly by an evidence-level mapping file
    for (const d of batch) {
      if (!d.explicitCode) continue;
      if (taken.has(d.explicitCode.toUpperCase())) {
        d.warnings.push(`Mã mới ${d.explicitCode} trùng với minh chứng khác — đánh số tự động`);
        continue;
      }
      d.newCode = d.explicitCode;
      taken.add(d.explicitCode.toUpperCase());
    }
    // 2) automatic numbering per new primary criterion, ordered by old code
    const groups = new Map<string, Draft[]>();
    for (const d of batch) if (!d.newCode) groups.set(d.targets[0].code, [...(groups.get(d.targets[0].code) ?? []), d]);
    for (const [crit, list] of groups) {
      const re = new RegExp(`^MC-${crit.replace(/\./g, "\\.")}\\.(\\d+)$`, "i");
      let n = 0;
      for (const c of taken) {
        const m = re.exec(c);
        if (m) n = Math.max(n, Number(m[1]));
      }
      for (const d of list.sort((a, b) => naturalCmp(a.code, b.code))) {
        let code: string;
        do code = `MC-${crit}.${String(++n).padStart(2, "0")}`;
        while (taken.has(code.toUpperCase()));
        taken.add(code.toUpperCase());
        d.newCode = code;
      }
    }
  }

  const rows: CrosswalkRow[] = drafts.map((d) => ({
    evidenceId: d.evidenceId,
    code: d.code,
    title: d.title,
    old: d.old,
    matchedCode: d.matchedCode,
    newCriteria: d.newCriteria,
    newCode: d.newCode,
    addLinks: d.addLinks,
    warnings: d.warnings,
    skip: d.skip,
  }));
  const work = drafts
    .filter((d) => !d.skip)
    .map((d) => ({
      evidenceId: d.evidenceId,
      note: `Chuyển mã từ ${d.matchedCode ?? d.old}`,
      criterionIds: d.targets.map((t) => t.id),
      newCode: d.newCode && d.newCode !== d.code ? d.newCode : null,
      description: d.description,
      oldCode: d.code,
    }));
  return {
    options: opts,
    targetSet,
    rows,
    mapping: mapping
      ? { criterion: mapping.criterion.length, evidence: mapping.evidence.length, issues: mapping.issues, sheets: mapping.sheets, skippedNoOld: mapping.skippedNoOld }
      : null,
    totals: {
      evidence: rows.length,
      ready: work.length,
      skipped: rows.length - work.length,
      linksToAdd: rows.reduce((s, r) => s + r.addLinks, 0),
      renamed: work.filter((w) => w.newCode).length,
      warnings: rows.filter((r) => r.warnings.length).length,
    },
    work,
  };
}

// ----------------------------------------------------------------------------- apply

export async function applyCrosswalk(plan: CrosswalkPlan) {
  const links = plan.work.flatMap((w) => w.criterionIds.map((criterionId) => ({ evidenceId: w.evidenceId, criterionId, note: w.note, suggestedByAi: false })));
  const renames = plan.work.filter((w) => w.newCode);
  return prisma.$transaction(
    async (tx) => {
      const created = links.length ? (await tx.evidenceCriterionLink.createMany({ data: links, skipDuplicates: true })).count : 0;
      // Two phases so that swaps/chains (A→B while B→C) never hit the (programId, code) unique index.
      for (const w of renames) await tx.evidence.update({ where: { id: w.evidenceId }, data: { code: `~cw~${w.evidenceId}` } });
      for (const w of renames) {
        const line = `Mã cũ: ${w.oldCode}`;
        const description = w.description?.includes(line) ? w.description : w.description?.trim() ? `${w.description.trim()}\n${line}` : line;
        await tx.evidence.update({ where: { id: w.evidenceId }, data: { code: w.newCode!, description } });
      }
      return { evidence: plan.work.length, linksCreated: created, renamed: renames.length };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

// ----------------------------------------------------------------------------- template

export async function crosswalkTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AIQMS3";
  const ws = wb.addWorksheet("Chuyển mã");
  ws.addRow(["Tiêu chí cũ", "Tiêu chí mới"]);
  ws.addRow(["1.1", "1.1"]);
  ws.addRow(["2.3", "1.4; 2.1"]);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 24;
  // Keep codes as text so Excel does not turn "1.10" into 1.1.
  ws.getColumn(1).numFmt = "@";
  ws.getColumn(2).numFmt = "@";
  const g = wb.addWorksheet("Hướng dẫn");
  g.getColumn(1).width = 120;
  [
    "Hướng dẫn bảng chuyển mã tiêu chí (AIQMS3)",
    "• Mỗi dòng: một tiêu chí của bộ cũ (vd. TT04/2016, AUN-QA) và tiêu chí tương ứng của bộ mới (vd. TT04/2025).",
    "• Cột Tiêu chí mới có thể ghi nhiều mã, cách nhau dấu phẩy hoặc chấm phẩy; mã đầu tiên là tiêu chí chính (dùng khi đổi mã minh chứng).",
    "• Một tiêu chí cũ có thể xuất hiện ở nhiều dòng — các tiêu chí mới sẽ được gộp lại.",
    "• Cũng chấp nhận bảng theo từng minh chứng: cột Mã cũ (vd. 1.2.04), Mã mới (vd. MC-1.2.02), Tiêu chí chính, Tiêu chí phụ.",
    "• Nên định dạng ô là Văn bản để Excel không đổi 1.10 thành 1.1.",
  ].forEach((t) => g.addRow([t]));
  g.getRow(1).font = { bold: true, size: 13 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
