// Builds a self-contained, print-ready HTML document for a Self-Assessment Report (SAR).
// Served either as a Word document (application/msword) or as a printable page → Save as PDF.
// No heavy dependency — Word and browsers both render this HTML reliably.

export interface SarExportSection {
  code?: string | null;
  title: string;
  content?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  improvementPlan?: string | null;
  evidence: Array<{ code: string; title: string }>;
}

export interface SarExportData {
  programCode: string;
  programName: string;
  cycleName: string;
  reportTitle: string;
  statusLabel: string;
  generatedAt: Date;
  sections: SarExportSection[];
  autoPrint?: boolean;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render multi-line user text as escaped HTML paragraphs. */
function paragraphs(text?: string | null): string {
  if (!text || !text.trim()) return `<p class="muted">—</p>`;
  return text
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${esc(line)}</p>`)
    .join("");
}

function block(label: string, text?: string | null): string {
  return `<div class="block"><div class="block-label">${esc(label)}</div>${paragraphs(text)}</div>`;
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function buildSarHtml(data: SarExportData): string {
  const sections = data.sections
    .map((s, i) => {
      const heading = s.code ? `Tiêu chí ${esc(s.code)} — ${esc(s.title)}` : esc(s.title);
      const evidence = s.evidence.length
        ? `<div class="block"><div class="block-label">Minh chứng liên kết (${s.evidence.length})</div><ul>${s.evidence
            .map((e) => `<li><b>${esc(e.code)}</b> — ${esc(e.title)}</li>`)
            .join("")}</ul></div>`
        : `<div class="block"><div class="block-label">Minh chứng liên kết</div><p class="muted">Chưa có minh chứng được liên kết.</p></div>`;
      return `<section class="${i > 0 ? "page-break" : ""}">
  <h2>${heading}</h2>
  ${block("1. Mô tả hiện trạng & phân tích", s.content)}
  ${block("2. Điểm mạnh", s.strengths)}
  ${block("3. Tồn tại", s.weaknesses)}
  ${block("4. Kế hoạch cải tiến", s.improvementPlan)}
  ${evidence}
</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>${esc(data.reportTitle)}</title>
<style>
  @page { size: A4; margin: 2cm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Georgia, serif; color: #111; font-size: 13pt; line-height: 1.5; margin: 0; }
  .cover { text-align: center; padding: 80px 0 40px; border-bottom: 2px solid #1e3a8a; margin-bottom: 28px; }
  .cover .org { font-size: 14pt; text-transform: uppercase; letter-spacing: 1px; color: #1e3a8a; font-weight: bold; }
  .cover h1 { font-size: 22pt; margin: 18px 0 8px; }
  .cover .meta { color: #444; font-size: 12pt; }
  h2 { font-size: 15pt; color: #1e3a8a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 0 0 12px; }
  .block { margin: 0 0 12px; }
  .block-label { font-weight: bold; margin-bottom: 4px; }
  p { margin: 0 0 6px; text-align: justify; }
  ul { margin: 4px 0 6px 20px; }
  .muted { color: #888; font-style: italic; }
  .page-break { page-break-before: always; }
  .footer { margin-top: 30px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 10pt; color: #888; text-align: center; }
  @media print { .noprint { display: none; } }
</style>
</head>
<body>
  <div class="cover">
    <div class="org">${esc(data.programCode)} · ${esc(data.programName)}</div>
    <h1>${esc(data.reportTitle)}</h1>
    <div class="meta">${esc(data.cycleName)} · Trạng thái: ${esc(data.statusLabel)}</div>
    <div class="meta">Xuất ngày ${fmtDate(data.generatedAt)}</div>
  </div>
  ${sections || `<p class="muted">Báo cáo chưa có mục nội dung.</p>`}
  <div class="footer">Báo cáo tự đánh giá — hệ thống AIQMS3. Tài liệu phục vụ kiểm định chất lượng chương trình đào tạo.</div>
  ${data.autoPrint ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});</script>` : ""}
</body>
</html>`;
}
