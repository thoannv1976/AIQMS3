// Import survey responses from Excel / CSV (e.g. a Google Forms export).
// Columns are mapped to questions by header text (Google Forms uses the full question text) or by
// "Q1" / "Câu 1" style headers; values are parsed exactly the way the public form (/s/[token]) stores them:
//   LIKERT → valueNumber 1..5 · SINGLE_CHOICE / OPEN → valueText · MULTI_CHOICE → options joined by "; ".
import crypto from "node:crypto";
import { readTables, norm, str, type Cell, type SheetTable } from "./sheet";

export type QType = "LIKERT" | "OPEN" | "SINGLE_CHOICE" | "MULTI_CHOICE";
export interface ImportQuestion {
  id: string;
  text: string;
  type: QType;
  order: number;
  options: unknown;
}
export interface ParsedAnswer {
  questionId: string;
  valueNumber: number | null;
  valueText: string | null;
}
export interface RowIssue {
  level: "error" | "warning";
  message: string;
}
export interface ParsedRow {
  /** 1-based position among the data rows of the sheet (used in the respondent label). */
  index: number;
  /** Row number in the spreadsheet. */
  rowNumber: number;
  answers: ParsedAnswer[];
  issues: RowIssue[];
  signature: string;
}
export interface ColumnMapping {
  col: number;
  header: string;
  questionId: string | null;
  /** 0-based position of the question in survey order. */
  questionIndex: number | null;
  via: "text" | "number" | null;
}
export interface SheetParse {
  file: string;
  sheet: string;
  columns: ColumnMapping[];
  unmatched: string[];
  missingQuestions: number[];
  rows: ParsedRow[];
  /** How well this sheet fits the survey (matched columns weighted by the share of values that parse cleanly). */
  score: number;
}

export const MAX_IMPORT_ROWS = 5000;
const MAX_TEXT = 2000;

// ----------------------------------------------------------------- column matching

const Q_NUMBER = /^(?:q|cau hoi|cau|question)\s*(\d{1,3})(?:\s|$)/;

function sortedQuestions(questions: ImportQuestion[]): ImportQuestion[] {
  return [...questions].sort((a, b) => a.order - b.order);
}

const words = (s: string) => (s ? s.split(" ").length : 0);
const containsWords = (hay: string, needle: string) => !!needle && ` ${hay} `.includes(` ${needle} `);

/** Map each (normalized) header to a question index. Each question is used at most once (first column wins). */
function mapHeaders(normHeaders: string[], qs: ImportQuestion[]): Array<{ q: number; via: "text" | "number" } | null> {
  const qn = qs.map((q) => norm(q.text));
  const out: Array<{ q: number; via: "text" | "number" } | null> = normHeaders.map(() => null);
  const used = new Set<number>();
  const assign = (col: number, q: number, via: "text" | "number") => {
    out[col] = { q, via };
    used.add(q);
  };

  // 1. exact header text
  normHeaders.forEach((h, c) => {
    if (!h) return;
    const q = qn.findIndex((t, i) => !used.has(i) && t === h);
    if (q >= 0) assign(c, q, "text");
  });
  // 2. header contains the question text (prefer the longest question), or a long header is part of the question
  normHeaders.forEach((h, c) => {
    if (!h || out[c]) return;
    let best = -1;
    qn.forEach((t, i) => {
      if (used.has(i) || !t) return;
      const hit = containsWords(h, t) || (words(h) >= 3 && !Q_NUMBER.test(h) && containsWords(t, h));
      if (hit && (best < 0 || t.length > qn[best].length)) best = i;
    });
    if (best >= 0) assign(c, best, "text");
  });
  // 3. "Q1", "Câu 1", "Q1 (…)" by question order
  normHeaders.forEach((h, c) => {
    if (!h || out[c]) return;
    const m = Q_NUMBER.exec(h);
    if (!m) return;
    const q = Number(m[1]) - 1;
    if (q >= 0 && q < qs.length && !used.has(q)) assign(c, q, "number");
  });
  return out;
}

// ----------------------------------------------------------------- value parsing

const LIKERT_LABELS: Array<[string, number]> = [
  ["rat khong dong y", 1],
  ["hoan toan khong dong y", 1],
  ["khong dong y", 2],
  ["phan van", 3],
  ["binh thuong", 3],
  ["trung lap", 3],
  ["trung binh", 3],
  ["khong y kien", 3],
  ["dong y", 4],
  ["rat dong y", 5],
  ["hoan toan dong y", 5],
];

function optionsOf(q: ImportQuestion): string[] {
  return Array.isArray(q.options) ? q.options.map((o) => String(o ?? "").trim()).filter(Boolean) : [];
}

function parseLikert(c: Cell): number | null {
  if (typeof c === "number") return Number.isInteger(c) && c >= 1 && c <= 5 ? c : null;
  const s = str(c);
  const n = norm(s);
  const exact = LIKERT_LABELS.find(([l]) => l === n);
  if (exact) return exact[1];
  // "5", "5.0", "5 - Rất đồng ý", "5 (Rất đồng ý)"
  const m = /^([1-5])(?:[.,]0+)?(?:\s*[-–:(.)]|\s|$)/.exec(s);
  if (m) return Number(m[1]);
  // "Rất đồng ý (5)" → trailing number
  const t = /\(([1-5])\)\s*$/.exec(s);
  if (t) return Number(t[1]);
  return null;
}

/** Split a multi-choice cell on ; or , while re-joining pieces of options that themselves contain a comma. */
function parseMulti(raw: string, options: string[]): { values: string[]; unknown: string[] } {
  const tokens = raw.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
  const byNorm = new Map(options.map((o) => [norm(o), o]));
  const values: string[] = [];
  const unknown: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    let matched = false;
    for (let j = tokens.length; j > i; j--) {
      const opt = byNorm.get(norm(tokens.slice(i, j).join(", ")));
      if (opt) {
        if (!values.includes(opt)) values.push(opt);
        i = j;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const t = tokens[i].slice(0, MAX_TEXT);
      if (!values.includes(t)) values.push(t);
      unknown.push(t);
      i++;
    }
  }
  return { values, unknown };
}

function parseValue(q: ImportQuestion, c: Cell, label: string, issues: RowIssue[]): ParsedAnswer | null {
  const raw = str(c);
  if (!raw) return null;
  switch (q.type) {
    case "LIKERT": {
      const v = parseLikert(c);
      if (v == null) {
        issues.push({ level: "error", message: `${label}: “${raw.slice(0, 60)}” không phải mức 1–5 (bỏ qua ô này)` });
        return null;
      }
      return { questionId: q.id, valueNumber: v, valueText: null };
    }
    case "SINGLE_CHOICE": {
      const opts = optionsOf(q);
      const hit = opts.find((o) => norm(o) === norm(raw));
      if (!hit && opts.length) issues.push({ level: "warning", message: `${label}: “${raw.slice(0, 60)}” không khớp lựa chọn nào (vẫn lưu dạng văn bản)` });
      return { questionId: q.id, valueNumber: null, valueText: (hit ?? raw).slice(0, MAX_TEXT) };
    }
    case "MULTI_CHOICE": {
      const opts = optionsOf(q);
      const { values, unknown } = parseMulti(raw, opts);
      if (!values.length) return null;
      if (unknown.length && opts.length) issues.push({ level: "warning", message: `${label}: “${unknown.join("; ").slice(0, 80)}” không khớp lựa chọn nào (vẫn lưu dạng văn bản)` });
      return { questionId: q.id, valueNumber: null, valueText: values.join("; ").slice(0, MAX_TEXT) };
    }
    default:
      return { questionId: q.id, valueNumber: null, valueText: raw.slice(0, MAX_TEXT) };
  }
}

/** Stable fingerprint of a response's answers (order-independent), used to skip duplicate imports. */
export function answerSignature(answers: Array<{ questionId: string; valueNumber: number | null; valueText: string | null }>): string {
  const key = answers
    .map((a) => `${a.questionId}=${a.valueNumber ?? ""}|${(a.valueText ?? "").trim()}`)
    .sort()
    .join("\n");
  return crypto.createHash("sha1").update(key).digest("hex");
}

// ----------------------------------------------------------------- sheets

/** Parse one table against the survey's questions. */
export function parseSheet(table: SheetTable, questions: ImportQuestion[]): SheetParse {
  const qs = sortedQuestions(questions);
  const map = mapHeaders(table.headers.map(norm), qs);
  const columns: ColumnMapping[] = table.headers.map((header, col) => ({
    col,
    header,
    questionId: map[col] ? qs[map[col]!.q].id : null,
    questionIndex: map[col]?.q ?? null,
    via: map[col]?.via ?? null,
  }));
  const mapped = columns.filter((c) => c.questionIndex != null);
  const matchedQ = new Set(mapped.map((c) => c.questionIndex!));

  let cleanCells = 0;
  let filledCells = 0;
  const rows: ParsedRow[] = table.rows.slice(0, MAX_IMPORT_ROWS).map((r, i) => {
    const issues: RowIssue[] = [];
    const answers: ParsedAnswer[] = [];
    for (const c of mapped) {
      const q = qs[c.questionIndex!];
      const cell = r.cells[c.col] ?? null;
      if (!str(cell)) continue;
      filledCells++;
      const before = issues.length;
      const a = parseValue(q, cell, `Câu ${c.questionIndex! + 1}`, issues);
      if (a) answers.push(a);
      if (issues.length === before) cleanCells++;
    }
    if (!answers.length) issues.push({ level: "error", message: "Không có câu trả lời hợp lệ — dòng sẽ bị bỏ qua" });
    return { index: i + 1, rowNumber: r.rowNumber, answers, issues, signature: answerSignature(answers) };
  });

  return {
    file: table.file,
    sheet: table.sheet,
    columns,
    unmatched: columns.filter((c) => c.questionIndex == null && c.header).map((c) => c.header),
    missingQuestions: qs.map((_, i) => i).filter((i) => !matchedQ.has(i)),
    rows,
    score: filledCells ? matchedQ.size * (cleanCells / filledCells) : matchedQ.size * 0.5,
  };
}

/** Read every sheet whose header row maps to at least two questions (one for single-question surveys). */
export async function readSurveySheets(file: { name: string; buffer: Buffer }, questions: ImportQuestion[]): Promise<SheetParse[]> {
  const qs = sortedQuestions(questions);
  const need = Math.min(2, qs.length);
  const tables = await readTables(file, (cells) => {
    const m = mapHeaders(cells, qs);
    return new Set(m.filter(Boolean).map((x) => x!.q)).size >= need;
  });
  return tables.map((t) => parseSheet(t, qs));
}

/** Index of the sheet that fits the survey best (ties → the first one). */
export function bestSheetIndex(sheets: SheetParse[]): number {
  let best = 0;
  sheets.forEach((s, i) => {
    if (s.score > sheets[best].score + 1e-9) best = i;
  });
  return best;
}

/** Human-readable rendering of an answer, for previews. */
export function answerLabel(a: ParsedAnswer | undefined): string {
  if (!a) return "";
  return a.valueNumber != null ? String(a.valueNumber) : (a.valueText ?? "");
}
