// Read a program's general information from a Word document: the "field | value" tables of a
// program declaration (Mã chương trình, Tên tiếng Anh, Trình độ, Tổng số tín chỉ, Khoa…),
// "Field: value" lines, and the specific objectives PO1, PO2… (from paragraphs or tables).
import { DegreeLevel } from "@/generated/prisma/enums";
import { norm } from "./sheet";
import type { DocxContent } from "./docx";

export interface ProgramObjective { code: string; text: string }
export interface ProgramInfo {
  code: string | null;
  nameVi: string | null;
  nameEn: string | null;
  majorCode: string | null;
  degreeLevel: DegreeLevel | null;
  totalCredits: number | null;
  facultyName: string | null;
  /** General objective ("Mục tiêu chung"). */
  generalObjective: string | null;
  objectivesList: ProgramObjective[];
  versionLabel: string | null;
  versionYear: number | null;
  versionSummary: string | null;
}

type Key = Exclude<keyof ProgramInfo, "objectivesList" | "versionYear" | "versionSummary"> | "version";

// Order matters: more specific labels first ("Tên chương trình tiếng Anh" before "Tên chương trình").
const LABELS: Array<[Key, string[]]> = [
  ["nameEn", ["ten tieng anh", "ten chuong trinh tieng anh", "ten ctdt tieng anh", "ten nganh tieng anh", "english name", "program name in english"]],
  ["majorCode", ["ma nganh", "ma so nganh", "major code"]],
  ["code", ["ma chuong trinh", "ma ctdt", "ma chuong trinh dao tao", "program code"]],
  ["nameVi", ["ten chuong trinh tieng viet", "ten chuong trinh", "ten ctdt", "ten chuong trinh dao tao", "ten nganh", "ten tieng viet", "program name"]],
  ["degreeLevel", ["trinh do dao tao", "trinh do", "bac dao tao", "degree level", "level"]],
  ["totalCredits", ["tong so tin chi", "so tin chi", "khoi luong kien thuc toan khoa", "khoi luong", "tong tin chi", "total credits"]],
  ["facultyName", ["khoa vien quan ly", "khoa vien", "don vi quan ly", "don vi phu trach", "khoa quan ly", "khoa phu trach", "khoa", "faculty"]],
  ["generalObjective", ["muc tieu chung", "muc tieu dao tao", "muc tieu tong quat", "general objective", "muc tieu"]],
  ["version", ["phien ban ctdt", "phien ban chuong trinh", "phien ban", "nam ban hanh", "version"]],
];

function keyOf(label: string): Key | null {
  const n = norm(label);
  if (!n || n.length > 60) return null;
  for (const [key, aliases] of LABELS) {
    if (aliases.some((a) => n === a || n.startsWith(a + " "))) return key;
  }
  return null;
}

export function degreeOf(v: string): DegreeLevel | null {
  const n = norm(v);
  if (!n) return null;
  if (/tien si|doctor|phd/.test(n)) return DegreeLevel.DOCTORATE;
  if (/thac si|master/.test(n)) return DegreeLevel.MASTER;
  if (/dai hoc|cu nhan|ky su|bachelor|undergraduate/.test(n)) return DegreeLevel.BACHELOR;
  return null;
}

const PO_LINE = /^\s*(PO\s*\d+)\s*[:.–\-)]\s*(.+)$/i;

/** Split "PO1: …PO2: …" runs and multi-line paragraphs into objective lines. */
function objectiveLines(texts: string[]): ProgramObjective[] {
  const out: ProgramObjective[] = [];
  for (const t of texts)
    for (const line of t.split(/\n|(?=\bPO\s*\d+\s*:)/i)) {
      const m = PO_LINE.exec(line);
      if (m) out.push({ code: m[1].replace(/\s+/g, "").toUpperCase(), text: m[2].trim() });
    }
  return out;
}

export function extractProgramInfo(doc: DocxContent): ProgramInfo {
  const values = new Map<Key, string>();
  const put = (k: Key | null, v: string) => {
    const val = v.trim();
    if (k && val && !values.has(k)) values.set(k, val);
  };
  const tablePos: ProgramObjective[] = [];
  for (const t of doc.tables)
    for (const row of t.rows) {
      const cells = row.map((c) => c.trim());
      if (cells.length < 2) continue;
      const po = /^PO\s*\d+$/i.exec(cells[0]);
      if (po && cells[1]) {
        tablePos.push({ code: cells[0].replace(/\s+/g, "").toUpperCase(), text: cells.slice(1).find(Boolean) ?? "" });
        continue;
      }
      put(keyOf(cells[0]), cells.slice(1).find(Boolean) ?? "");
    }
  for (const p of doc.paragraphs)
    for (const line of p.split("\n")) {
      const m = /^([^:]{3,60}):\s*(.+)$/.exec(line);
      if (m && !PO_LINE.test(line)) put(keyOf(m[1]), m[2]);
    }

  const version = values.get("version") ?? null;
  const year = version ? /\b(19|20)\d{2}\b/.exec(version)?.[0] ?? null : null;
  const credits = values.get("totalCredits");
  const objectivesList = tablePos.length ? tablePos : objectiveLines(doc.paragraphs);
  return {
    code: values.get("code")?.toUpperCase().replace(/\s+/g, "") ?? null,
    nameVi: values.get("nameVi") ?? null,
    nameEn: values.get("nameEn") ?? null,
    majorCode: values.get("majorCode") ?? null,
    degreeLevel: degreeOf(values.get("degreeLevel") ?? ""),
    totalCredits: credits ? parseInt(credits.replace(/[^\d]/g, ""), 10) || null : null,
    facultyName: values.get("facultyName") ?? null,
    generalObjective: values.get("generalObjective") ?? null,
    objectivesList: objectivesList.filter((x, i, a) => a.findIndex((y) => y.code === x.code) === i),
    versionLabel: year,
    versionYear: year ? parseInt(year, 10) : null,
    versionSummary: version,
  };
}

/** How many usable facts the document carries (0 = not a program declaration). */
export function infoScore(i: ProgramInfo): number {
  return [i.code, i.nameVi, i.nameEn, i.majorCode, i.degreeLevel, i.totalCredits, i.facultyName, i.generalObjective, i.versionSummary].filter(Boolean).length + (i.objectivesList.length ? 1 : 0);
}

/** "Mục tiêu đào tạo" text stored on the program: general objective, then PO1…POn. */
export function composeObjectives(i: ProgramInfo): string | null {
  const parts: string[] = [];
  if (i.generalObjective) parts.push(i.generalObjective);
  if (i.objectivesList.length) parts.push(["Mục tiêu cụ thể:", ...i.objectivesList.map((o) => `${o.code}: ${o.text}`)].join("\n"));
  return parts.join("\n\n") || null;
}

/** "Mô tả" text: the major code and the issued version. */
export function composeDescription(i: ProgramInfo): string | null {
  const parts: string[] = [];
  if (i.majorCode) parts.push(`Mã ngành: ${i.majorCode}`);
  if (i.versionSummary) parts.push(`Phiên bản CTĐT: ${i.versionSummary}`);
  return parts.join("\n") || null;
}

/** Match a faculty by name, ignoring accents, case and a leading "Khoa"/"Viện". */
export function matchFaculty<T extends { id: string; name: string }>(faculties: T[], name: string | null): T | null {
  if (!name) return null;
  const strip = (s: string) => norm(s).replace(/^(khoa|vien|trung tam|bo mon)\s+/, "");
  const target = strip(name);
  return faculties.find((f) => strip(f.name) === target) ?? faculties.find((f) => strip(f.name).includes(target) || target.includes(strip(f.name))) ?? null;
}
