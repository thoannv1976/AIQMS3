// Minimal Word (.docx) reader for data import: returns every table as a grid of cell texts
// plus the body paragraphs outside tables. Merged cells are handled so table grids line up:
// a horizontally merged cell (gridSpan) fills its first column and leaves the others empty,
// a vertically merged cell (vMerge continue) repeats the value from the row above.
import JSZip from "jszip";

export interface DocxTable {
  /** 1-based position of the table in the document. */
  index: number;
  rows: string[][];
}
export interface DocxContent {
  tables: DocxTable[];
  /** Paragraphs outside tables, in order; line breaks inside a paragraph are kept as "\n". */
  paragraphs: string[];
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITY[e] ?? m;
  });
const attr = (attrs: string, name: string) => new RegExp(`w:${name}="([^"]*)"`).exec(attrs)?.[1];

interface CellState { paras: string[]; span: number; vmerge: "restart" | "continue" | null }
interface TableState { rows: string[][]; row: string[] | null; cell: CellState | null }

export function parseDocxXml(xml: string): DocxContent {
  const tables: DocxTable[] = [];
  const paragraphs: string[] = [];
  const stack: TableState[] = [];
  let para: string | null = null;
  let inText = false;
  let count = 0;
  const re = /<(\/?)w:([A-Za-z]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, close, tag, attrs, selfClose, text] = m;
    if (text !== undefined) {
      if (inText && para !== null) para += decode(text);
      continue;
    }
    const top = stack[stack.length - 1];
    if (tag === "t") {
      inText = !close && !selfClose;
      continue;
    }
    if (close) {
      if (tag === "p" && para !== null) {
        const p = para.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
        if (top?.cell) top.cell.paras.push(p);
        else if (p) paragraphs.push(p);
        para = null;
      } else if (tag === "tc" && top?.cell && top.row) {
        const value = top.cell.paras.filter(Boolean).join("\n").trim();
        const col = top.row.length;
        if (top.cell.vmerge === "continue") top.row.push(top.rows[top.rows.length - 1]?.[col] ?? "");
        else top.row.push(value);
        for (let i = 1; i < top.cell.span; i++) top.row.push("");
        top.cell = null;
      } else if (tag === "tr" && top?.row) {
        top.rows.push(top.row);
        top.row = null;
      } else if (tag === "tbl" && top) {
        stack.pop();
        tables.push({ index: ++count, rows: top.rows.filter((r) => r.some((c) => c.trim())) });
        // Text of a nested table also belongs to the outer cell, so key–value tables still read.
        const outer = stack[stack.length - 1];
        if (outer?.cell) outer.cell.paras.push(...top.rows.map((r) => r.filter(Boolean).join(" ")));
      }
      continue;
    }
    switch (tag) {
      case "tbl":
        stack.push({ rows: [], row: null, cell: null });
        break;
      case "tr":
        if (top) top.row = [];
        break;
      case "tc":
        if (top) top.cell = { paras: [], span: 1, vmerge: null };
        break;
      case "gridSpan":
        if (top?.cell) top.cell.span = Math.max(1, parseInt(attr(attrs, "val") ?? "1", 10) || 1);
        break;
      case "vMerge":
        if (top?.cell) top.cell.vmerge = attr(attrs, "val") === "restart" ? "restart" : "continue";
        break;
      case "p":
        if (!selfClose) para = "";
        else if (top?.cell) top.cell.paras.push("");
        break;
      case "tab":
        if (para !== null && !attrs.includes("w:pos")) para += " ";
        break;
      case "br":
      case "cr":
        if (para !== null) para += "\n";
        break;
    }
  }
  return { tables, paragraphs };
}

export async function readDocx(buffer: Buffer): Promise<DocxContent> {
  const zip = await JSZip.loadAsync(buffer);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("Tệp không phải Word .docx hợp lệ.");
  return parseDocxXml(await doc.async("string"));
}
