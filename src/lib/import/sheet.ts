// Tolerant spreadsheet reader for data import (Excel .xlsx / .csv).
// Finds the header row automatically (title rows above the table are allowed) and
// returns plain string/number cells keyed by the header text.
import ExcelJS from "exceljs";

export type Cell = string | number | null;
export interface SheetTable {
  file: string;
  sheet: string;
  headers: string[];
  rows: Array<{ rowNumber: number; cells: Cell[] }>;
}

/** Lower-case, strip accents and punctuation so "Mã HP", "ma hp", "MÃ HỌC PHẦN" compare easily. */
export function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v && v.result != null) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim() || null;
    if ("text" in v && typeof v.text === "string") return v.text.trim() || null;
    if ("hyperlink" in v) return String((v as { text?: string }).text ?? "").trim() || null;
  }
  return String(v).trim() || null;
}

/**
 * Read every sheet of a workbook. `isHeader` decides which of the first 12 rows is the header
 * (the first row that passes wins); sheets without a recognisable header are skipped.
 */
export async function readTables(
  file: { name: string; buffer: Buffer },
  isHeader: (normalizedCells: string[]) => boolean,
): Promise<SheetTable[]> {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(file.name)) {
    const { Readable } = await import("node:stream");
    await wb.csv.read(Readable.from(file.buffer.toString("utf8").replace(/^﻿/, "")));
  } else {
    // exceljs' typings predate Node's generic Buffer; the runtime accepts it as-is.
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
  }
  const out: SheetTable[] = [];
  wb.eachSheet((ws) => {
    const grid: Array<{ rowNumber: number; cells: Cell[] }> = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (c, col) => {
        cells[col - 1] = cellValue(c.value);
      });
      grid.push({ rowNumber, cells: Array.from({ length: cells.length }, (_, i) => cells[i] ?? null) });
    });
    const hIdx = grid.slice(0, 12).findIndex((r) => isHeader(r.cells.map(norm)));
    if (hIdx < 0) return;
    const headers = grid[hIdx].cells.map((c) => String(c ?? "").trim());
    const rows = grid.slice(hIdx + 1).filter((r) => r.cells.some((c) => c != null && String(c).trim() !== ""));
    out.push({ file: file.name, sheet: ws.name, headers, rows });
  });
  return out;
}

/** Index of the first header matching any alias (aliases are compared after norm(); prefix match allowed). */
export function findCol(headers: string[], aliases: string[], opts: { exact?: boolean } = {}): number {
  const H = headers.map(norm);
  for (const a of aliases.map(norm)) {
    const i = H.findIndex((h) => h === a);
    if (i >= 0) return i;
  }
  if (opts.exact) return -1;
  for (const a of aliases.map(norm)) {
    const i = H.findIndex((h) => h.startsWith(a + " ") || h.startsWith(a + "("));
    if (i >= 0) return i;
  }
  return -1;
}

export function str(c: Cell | undefined): string {
  return c == null ? "" : String(c).trim();
}

export function int(c: Cell | undefined): number | null {
  if (c == null || c === "") return null;
  const n = typeof c === "number" ? c : Number(String(c).replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Parse dd/mm/yyyy, yyyy-mm-dd or an Excel serial date. */
export function dateCell(c: Cell | undefined): Date | null {
  if (c == null || c === "") return null;
  if (typeof c === "number" && c > 20000 && c < 80000) return new Date(Math.round((c - 25569) * 86400 * 1000));
  const s = String(c).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 16, 59, 59));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 16, 59, 59));
  return null;
}

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Collect uploaded spreadsheet files from a FormData field. */
export async function filesFrom(fd: FormData, field = "files"): Promise<Array<{ name: string; buffer: Buffer }>> {
  const out: Array<{ name: string; buffer: Buffer }> = [];
  for (const v of fd.getAll(field)) {
    if (typeof v === "string" || !v.size) continue;
    if (!/\.(xlsx|csv)$/i.test(v.name)) throw new Error(`Tệp ${v.name}: chỉ nhận .xlsx hoặc .csv`);
    if (v.size > MAX_IMPORT_BYTES) throw new Error(`Tệp ${v.name} vượt quá 5 MB`);
    out.push({ name: v.name, buffer: Buffer.from(await v.arrayBuffer()) });
  }
  return out;
}
