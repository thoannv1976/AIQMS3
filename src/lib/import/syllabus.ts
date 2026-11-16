// Import a course syllabus (đề cương học phần) from the plain text of a Word file.
//
// Two layers:
//   1. parseSyllabusText — deterministic: split on the headings typical of Vietnamese
//      syllabi ("2. Mục tiêu học phần", "Phương pháp dạy học", …) and read the CLO table.
//   2. aiRefineSyllabus — optional: ask the model for the same JSON shape with the
//      deterministic result as fallback; AI values only win when they are non-empty.
//
// Word tables come out of the text extractor as one cell per line, so the CLO table and
// the schedule / assessment tables are re-assembled from consecutive lines here.

export const SYLLABUS_FIELDS = [
  "objectives",
  "content",
  "teachingMethods",
  "assessmentMethods",
  "materials",
  "schedule",
  "requirements",
] as const;
export type SyllabusField = (typeof SYLLABUS_FIELDS)[number];
export type SyllabusFields = Record<SyllabusField, string>;

export type CloStrength = "LOW" | "MEDIUM" | "HIGH";
export interface ParsedClo {
  code: string;
  description: string;
  plos: string[];
  strength: CloStrength;
}

export interface ParsedSyllabus {
  fields: SyllabusFields;
  clos: ParsedClo[];
  /** True when a "Chuẩn đầu ra học phần" heading was found (even if the table is empty). */
  cloSectionFound: boolean;
}

const MAX_FIELD = 20_000;
const MAX_CLOS = 60;

/** Lower-case and strip Vietnamese accents so headings compare easily. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function emptyFields(): SyllabusFields {
  return { objectives: "", content: "", teachingMethods: "", assessmentMethods: "", materials: "", schedule: "", requirements: "" };
}

// ----------------------------- headings -----------------------------

type SectionKey = SyllabusField | "clos" | "info";

// Keyword rules used after a numbered prefix ("2. Mục tiêu …", "III. ĐÁNH GIÁ …").
// Order matters: "phương pháp đánh giá" must win over "phương pháp …".
const NUMBERED_RULES: Array<[RegExp, SectionKey]> = [
  [/^thong tin (chung|ve hoc phan)/, "info"],
  [/^muc tieu/, "objectives"],
  [/^chuan dau ra/, "clos"],
  [/^(phuong phap|hinh thuc|cach thuc) (danh gia|kiem tra)/, "assessmentMethods"],
  [/^danh gia/, "assessmentMethods"],
  [/^(phuong phap|hinh thuc|cach thuc|to chuc)/, "teachingMethods"],
  [/^noi dung/, "content"],
  [/^(tai lieu|hoc lieu|giao trinh)/, "materials"],
  [/^(ke hoach|lich trinh|tien do)/, "schedule"],
  [/^(cac )?(yeu cau|quy dinh)/, "requirements"],
];

// Unnumbered headings must be more specific — "Nội dung" alone is also a table header.
const PLAIN_RULES: Array<[RegExp, SectionKey]> = [
  [/^thong tin chung( ve hoc phan)?$/, "info"],
  [/^muc tieu (cua )?(hoc phan|mon hoc)/, "objectives"],
  [/^chuan dau ra (cua )?(hoc phan|mon hoc)/, "clos"],
  [/^phuong phap (danh gia|kiem tra)/, "assessmentMethods"],
  [/^danh gia (hoc phan|ket qua|mon hoc)/, "assessmentMethods"],
  [/^phuong phap (day hoc|giang day|day va hoc)/, "teachingMethods"],
  [/^noi dung (chi tiet )?(cua )?(hoc phan|mon hoc)/, "content"],
  [/^tai lieu (hoc tap|tham khao|day hoc)/, "materials"],
  [/^ke hoach (giang day|day hoc|hoc tap)/, "schedule"],
  [/^lich trinh( giang day| day hoc)?$/, "schedule"],
  [/^yeu cau (doi voi|cua|voi) (nguoi hoc|sinh vien)/, "requirements"],
];

// Lines that close the last section (signature block / distribution list).
const END_RE = /^(noi nhan|truong (bo mon|khoa)|pho truong khoa|nguoi (bien soan|soan thao|lap)|hieu truong|phe duyet|\(da ky\)|\(ky,? ghi ro ho ten\))/;

function romanToInt(s: string): number {
  const v: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  let total = 0;
  for (let k = 0; k < s.length; k++) {
    const cur = v[s[k]] ?? 0;
    const next = v[s[k + 1]] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}

interface Heading {
  key: SectionKey;
  num: number | null; // top-level number, when numbered
  depth: number; // 1 for "2.", 2 for "2.1"
  inline: string; // text after "Heading:" on the same line
  strict: boolean; // also matches the specific (unnumbered) wording
}

function matchHeading(rawLine: string): Heading | null {
  const line = rawLine.trim();
  if (!line || line.length > 140) return null;
  const f = fold(line);
  let num: number | null = null;
  let depth = 0;
  let rest = f;
  const m = /^(\d{1,2}(?:\.\d{1,2})*)\s*[.)]?\s+(.*)$/.exec(f) ?? null;
  const r = m ? null : /^([ivxlc]{1,6})\s*[.)]\s*(.*)$/.exec(f);
  if (m) {
    const parts = m[1].split(".");
    num = Number(parts[0]);
    depth = parts.length;
    rest = m[2];
  } else if (r) {
    num = romanToInt(r[1]);
    depth = 1;
    rest = r[2];
  }
  // "Mục tiêu: Giúp sinh viên…" → heading + inline content.
  let head = rest;
  let inline = "";
  const colon = rest.indexOf(":");
  if (colon > 0 && colon < rest.length - 1) {
    head = rest.slice(0, colon).trim();
    // Recover the original (accented) text after the colon.
    const origColon = line.indexOf(":");
    inline = origColon >= 0 ? line.slice(origColon + 1).trim() : "";
  } else if (colon === rest.length - 1) {
    head = rest.slice(0, -1).trim();
  }
  if (head.length > 90) return null;
  const strictKey = PLAIN_RULES.find(([re]) => re.test(head))?.[1];
  if (num == null) return strictKey ? { key: strictKey, num, depth, inline, strict: true } : null;
  const key = NUMBERED_RULES.find(([re]) => re.test(head))?.[1];
  return key ? { key, num, depth, inline, strict: strictKey === key } : null;
}

// ----------------------------- tables -----------------------------

const PERCENT_RE = /^\d{1,3}([.,]\d+)?\s*%$/;
const CLO_LIST_RE = /^clo\s*\d+(\.\d+)?(\s*([,;/&+–-]|va|den)\s*(clo)?\s*\d+(\.\d+)?)*$/;

/** Re-assemble a schedule table ("Tuần | Nội dung | Hoạt động | CLO") from one-cell-per-line text. */
function compactSchedule(lines: string[]): string[] {
  const rowStart = (l: string): [number, number] | null => {
    const m = /^(?:tuan|buoi)?\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/.exec(fold(l));
    return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
  };
  const header: string[] = [];
  const rows: string[][] = [];
  let expected: number | null = null;
  for (const l of lines) {
    const s = rowStart(l);
    const isStart = s != null && (expected == null ? s[0] <= 2 : s[0] === expected);
    if (isStart && s) {
      rows.push([l]);
      expected = s[1] + 1;
    } else if (rows.length) rows[rows.length - 1].push(l);
    else header.push(l);
  }
  if (rows.length < 2) return lines;
  const out = rows.map((r) => r.join(" | "));
  return header.length ? [header.join(" | "), ...out] : out;
}

/** A second table (e.g. a rubric) glued to its first row: "Rubric … | Tiêu chí | … | Trọng số | row…". */
function splitSubTable(row: string[]): string[] {
  const i = row.findIndex((c) => /^tieu chi/.test(fold(c)));
  const j = row.findIndex((c, k) => k > i && /^(trong so|ty trong)$/.test(fold(c)));
  if (i < 0 || j < 0 || j === row.length - 1) return [row.join(" | ")];
  const out: string[] = [];
  if (i > 0) out.push(row.slice(0, i).join(" "));
  out.push(row.slice(i, j + 1).join(" | "), row.slice(j + 1).join(" | "));
  return out;
}

/** Re-assemble an assessment table: each row ends at its weight (%) cell, optionally followed by the CLO list. */
function compactAssessment(lines: string[]): string[] {
  if (!lines.some((l) => PERCENT_RE.test(l.trim()))) return lines;
  const HEADER = new Set(["thanh phan", "thanh phan danh gia", "hinh thuc", "hinh thuc danh gia", "trong so", "ty trong", "clo danh gia", "clo", "noi dung", "phuong phap danh gia", "thoi diem", "bai danh gia", "chuan dau ra"]);
  let k = 0;
  while (k < lines.length && HEADER.has(fold(lines[k]))) k++;
  const out: string[] = [];
  if (k >= 2) out.push(lines.slice(0, k).join(" | "));
  else k = 0;
  let row: string[] = [];
  for (let j = k; j < lines.length; j++) {
    const l = lines[j];
    row.push(l);
    const isPct = PERCENT_RE.test(l.trim());
    const nextIsCloList = j + 1 < lines.length && CLO_LIST_RE.test(fold(lines[j + 1]));
    const isCloAfterPct = CLO_LIST_RE.test(fold(l)) && j > 0 && PERCENT_RE.test(lines[j - 1].trim());
    if ((isPct && !nextIsCloList) || isCloAfterPct) {
      out.push(...splitSubTable(row));
      row = [];
    }
  }
  if (row.length) out.push(...row);
  return out;
}

// ----------------------------- CLOs -----------------------------

const CLO_START_RE = /^CLO\s*(\d{1,2}(?:\.\d{1,2})?)\b\s*[.:)\-–|]?\s*(.*)$/i;
const PLO_CODE_RE = /PLO\s*(\d{1,2}(?:\.\d{1,2})?)/gi;
const PLO_LIST_RE = /^(plo\s*\d{1,2}(\.\d{1,2})?|[\s,;/&+–-]|va)+$/;

function strengthOf(cell: string): CloStrength | null {
  const f = fold(cell);
  if (f.length > 40) return null;
  if (/^(cao|high|manh)\b/.test(f) || /^(h|3)$/.test(f)) return "HIGH";
  if (/^(trung binh|medium|vua)\b/.test(f) || /^(m|2)$/.test(f)) return "MEDIUM";
  if (/^(thap|low|yeu)\b/.test(f) || /^(l|1)$/.test(f)) return "LOW";
  return null;
}

function ploCodes(text: string): string[] {
  return [...new Set([...text.matchAll(PLO_CODE_RE)].map((m) => `PLO${m[1]}`))];
}

function parseCloRow(code: string, cells: string[]): ParsedClo {
  const desc: string[] = [];
  let plos: string[] = [];
  let strength: CloStrength | null = null;
  let complete = false;
  for (const raw of cells.flatMap((c) => c.split(/\t+|\s\|\s/))) {
    const cell = raw.trim();
    if (!cell || complete) continue;
    const f = fold(cell);
    if (PLO_LIST_RE.test(f)) {
      plos = [...plos, ...ploCodes(cell)];
      continue;
    }
    const st = desc.length ? strengthOf(cell) : null;
    if (st) {
      strength = st;
      if (plos.length) complete = true; // ignore notes that follow the table row
      continue;
    }
    // Inline form: "Giải thích … (PLO1, PLO3; Cao)" or "… – PLO2 – Trung bình".
    const firstPlo = cell.search(/PLO\s*\d/i);
    if (firstPlo > 0 && !plos.length) {
      const tail = cell.slice(firstPlo);
      plos = ploCodes(tail);
      const tailStrength = /(cao|trung binh|thap|high|medium|low)/.exec(fold(tail));
      if (tailStrength) strength = strengthOf(tailStrength[1]);
      const head = cell.slice(0, firstPlo).replace(/[\s([{,;:–—-]+$/, "").trim();
      if (head) desc.push(head);
      continue;
    }
    desc.push(cell);
  }
  return {
    code,
    description: desc.join(" ").replace(/\s+/g, " ").trim(),
    plos: [...new Set(plos)],
    strength: strength ?? "MEDIUM",
  };
}

function parseClos(lines: string[], strict: boolean): ParsedClo[] {
  const groups: Array<{ code: string; cells: string[] }> = [];
  let cur: { code: string; cells: string[] } | null = null;
  for (const l of lines) {
    const line = l.trim();
    const m = CLO_START_RE.exec(line);
    // "CLO1, CLO3" / "CLO2–CLO4" are references (assessment, schedule), not CLO rows.
    const isList = /^clo\s*\d+(\.\d+)?\s*([,;/&+–-]|va|den)\s*(clo)?\s*\d/.test(fold(line));
    if (m && !isList) {
      cur = { code: `CLO${m[1]}`, cells: m[2] ? [m[2]] : [] };
      groups.push(cur);
    } else if (cur) {
      cur.cells.push(line);
    }
  }
  const seen = new Set<string>();
  const out: ParsedClo[] = [];
  for (const g of groups) {
    if (seen.has(g.code)) continue;
    const clo = parseCloRow(g.code, strict ? g.cells : g.cells.slice(0, 4));
    // Outside a CLO section, only accept rows that really carry a description.
    if (!strict && clo.description.length < 15) continue;
    if (!clo.description) continue;
    seen.add(g.code);
    out.push(clo);
  }
  return out.slice(0, MAX_CLOS);
}

// ----------------------------- main parser -----------------------------

export function parseSyllabusText(text: string): ParsedSyllabus {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/ /g, " ").trim())
    .filter(Boolean);

  const buckets: Record<SectionKey, string[]> = {
    info: [],
    clos: [],
    objectives: [],
    content: [],
    teachingMethods: [],
    assessmentMethods: [],
    materials: [],
    schedule: [],
    requirements: [],
  };
  let current: SectionKey | null = null;
  let lastNum = 0;
  let cloSectionFound = false;
  let numberedSeen = false;
  let plainSeen = false;

  for (const line of lines) {
    if (current && END_RE.test(fold(line))) {
      current = null;
      continue;
    }
    const h = matchHeading(line);
    // Numbered headings must move forward ("3. Đánh giá mô hình" inside section 4 is content).
    // In a document whose headings are unnumbered, a numbered line is usually a list item
    // ("2. Đánh giá tài sản"), so it must then match the specific wording.
    const accepted =
      h &&
      (h.num == null || ((h.num > lastNum || (h.depth > 1 && h.num >= lastNum)) && (numberedSeen || !plainSeen || h.strict)));
    if (h && accepted) {
      if (h.num != null) {
        lastNum = Math.max(lastNum, h.num);
        numberedSeen = true;
      } else plainSeen = true;
      if (h.key === current && h.depth > 1) buckets[h.key].push(line); // keep "7.2 Tài liệu tham khảo" as a sub-title
      current = h.key;
      if (h.key === "clos") cloSectionFound = true;
      if (h.inline) buckets[h.key].push(h.inline);
      continue;
    }
    if (current) buckets[current].push(line);
  }

  const fields = emptyFields();
  for (const f of SYLLABUS_FIELDS) {
    let ls = buckets[f];
    if (f === "schedule") ls = compactSchedule(ls);
    if (f === "assessmentMethods") ls = compactAssessment(ls);
    fields[f] = ls.join("\n").slice(0, MAX_FIELD).trim();
  }

  const clos = cloSectionFound ? parseClos(buckets.clos, true) : parseClos(lines, false);
  return { fields, clos, cloSectionFound };
}

// ----------------------------- validation & merge -----------------------------

const STRENGTHS: CloStrength[] = ["LOW", "MEDIUM", "HIGH"];

function normCloCode(v: unknown): string | null {
  const m = /^CLO\s*(\d{1,2}(?:\.\d{1,2})?)$/i.exec(String(v ?? "").trim());
  return m ? `CLO${m[1]}` : null;
}

export function normPloCode(v: unknown): string | null {
  const m = /^PLO\s*(\d{1,2}(?:\.\d{1,2})?)$/i.exec(String(v ?? "").trim());
  return m ? `PLO${m[1]}` : null;
}

type CoercedClo = ParsedClo & { strengthGiven: boolean };

/** Validate untrusted input (AI JSON or the client's edited preview) into the parser's shape. */
export function coerceSyllabus(raw: unknown): { fields: SyllabusFields; clos: ParsedClo[] } {
  const r = coerceRaw(raw);
  return { fields: r.fields, clos: r.clos.map((c) => ({ code: c.code, description: c.description, plos: c.plos, strength: c.strength })) };
}

function coerceRaw(raw: unknown): { fields: SyllabusFields; clos: CoercedClo[] } {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const src = (obj.fields && typeof obj.fields === "object" ? obj.fields : obj) as Record<string, unknown>;
  const fields = emptyFields();
  for (const f of SYLLABUS_FIELDS) {
    const v = src[f];
    fields[f] = typeof v === "string" ? v.trim().slice(0, MAX_FIELD) : "";
  }
  const clos: CoercedClo[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(obj.clos) ? obj.clos : []) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const code = normCloCode(r.code);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const strength = String(r.strength ?? "").toUpperCase() as CloStrength;
    clos.push({
      code,
      description: typeof r.description === "string" ? r.description.replace(/\s+/g, " ").trim().slice(0, 2000) : "",
      plos: [...new Set((Array.isArray(r.plos) ? r.plos : []).map(normPloCode).filter((x): x is string => Boolean(x)))],
      strength: STRENGTHS.includes(strength) ? strength : "MEDIUM",
      strengthGiven: STRENGTHS.includes(strength),
    });
    if (clos.length >= MAX_CLOS) break;
  }
  return { fields, clos };
}

const cloOrder = (code: string) => Number(code.replace(/^CLO/, "").split(".")[0]) * 100 + Number(code.split(".")[1] ?? 0);

/** AI values win only when they are non-empty. */
function mergeSyllabus(base: ParsedSyllabus, ai: { fields: SyllabusFields; clos: CoercedClo[] }): ParsedSyllabus {
  const fields = { ...base.fields };
  for (const f of SYLLABUS_FIELDS) if (ai.fields[f]) fields[f] = ai.fields[f];
  const byCode = new Map(base.clos.map((c) => [c.code, { ...c }]));
  for (const c of ai.clos) {
    const prev = byCode.get(c.code);
    if (!prev) {
      if (c.description) byCode.set(c.code, { code: c.code, description: c.description, plos: c.plos, strength: c.strength });
      continue;
    }
    byCode.set(c.code, {
      code: c.code,
      description: c.description || prev.description,
      plos: c.plos.length ? c.plos : prev.plos,
      strength: c.strengthGiven ? c.strength : prev.strength,
    });
  }
  const clos = [...byCode.values()].sort((a, b) => cloOrder(a.code) - cloOrder(b.code));
  return { fields, clos, cloSectionFound: base.cloSectionFound || ai.clos.length > 0 };
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const AI_SYSTEM =
  "Bạn trích xuất dữ liệu từ đề cương chi tiết học phần của một trường đại học Việt Nam. " +
  "Chỉ trả về MỘT đối tượng JSON hợp lệ, không giải thích, không markdown. " +
  "Giữ nguyên văn bản gốc (tiếng Việt), không bịa thêm nội dung; trường nào không có trong tài liệu thì để chuỗi rỗng, " +
  "không có CLO thì trả mảng rỗng.";

/**
 * Optional AI pass: ask for the same JSON shape, using the deterministic result as the
 * fallback (no key / mock mode / failure). The merged result is returned for human review.
 */
export async function aiRefineSyllabus(
  text: string,
  base: ParsedSyllabus,
  userId?: string | null,
): Promise<{ result: ParsedSyllabus; usedFallback: boolean; model: string }> {
  const { aiComplete } = await import("@/lib/ai/client");
  const baseJson = JSON.stringify({ ...base.fields, clos: base.clos });
  const prompt = [
    "Trích xuất đề cương dưới đây thành JSON đúng cấu trúc:",
    '{"objectives": string, "content": string, "teachingMethods": string, "assessmentMethods": string, "materials": string, "schedule": string, "requirements": string,',
    ' "clos": [{"code": "CLO1", "description": string, "plos": ["PLO1","PLO3"], "strength": "LOW"|"MEDIUM"|"HIGH"}]}',
    "Quy ước: objectives = Mục tiêu học phần; content = Nội dung học phần (mỗi chủ đề một dòng); teachingMethods = Phương pháp dạy học;",
    "assessmentMethods = Đánh giá học phần (mỗi thành phần một dòng, kèm hình thức, trọng số %, CLO); materials = Tài liệu học tập (mỗi tài liệu một dòng);",
    "schedule = Kế hoạch giảng dạy / lịch trình (mỗi tuần một dòng); requirements = Yêu cầu đối với người học.",
    "clos lấy từ bảng Chuẩn đầu ra học phần: plos là các mã PLO liên kết; strength: Cao→HIGH, Trung bình→MEDIUM, Thấp→LOW (mặc định MEDIUM).",
    "",
    "Kết quả phân tích tự động (có thể thiếu hoặc sai, hãy sửa):",
    baseJson.slice(0, 12_000),
    "",
    "Văn bản đề cương:",
    "<<<",
    text.slice(0, 24_000),
    ">>>",
  ].join("\n");

  const res = await aiComplete({
    system: AI_SYSTEM,
    prompt,
    maxTokens: 6000,
    fallback: () => baseJson,
    feature: "syllabus_import",
    userId,
  });
  if (res.usedFallback) return { result: base, usedFallback: true, model: res.model };
  const parsed = extractJson(res.text);
  if (!parsed) return { result: base, usedFallback: true, model: res.model };
  return { result: mergeSyllabus(base, coerceRaw(parsed)), usedFallback: false, model: res.model };
}
