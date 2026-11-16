// Small helpers for Word/printable HTML exports.

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Very small Markdown → HTML for Word export (headings, bold, lists, paragraphs). */
export function mdToHtml(md: string): string {
  const out: string[] = [];
  let inList = false;
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const t = raw.trim();
    const b = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    if (/^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) {
      if (!inList) out.push("<ul>");
      inList = true;
      out.push(`<li>${b(t.replace(/^([-*•]|\d+[.)])\s+/, ""))}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lv = Math.min(h[1].length + 1, 4);
      out.push(`<h${lv}>${b(h[2])}</h${lv}>`);
    } else if (t) out.push(`<p>${b(t)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

/** Wrap body HTML in a Word-compatible document shell. `autoPrint` opens the print dialog (Save as PDF). */
export function wordDocument(title: string, body: string, autoPrint = false): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.45;max-width:900px;margin:24px auto;padding:0 16px} h1{font-size:16pt;color:#1F4E9A} h2{font-size:13pt;color:#2E75B6;margin-top:18px} h3{font-size:12pt}
table{border-collapse:collapse;width:100%;margin:8px 0} th,td{border:1px solid #BFBFBF;padding:4px 6px;font-size:10pt;text-align:left;vertical-align:top} th{background:#DEEAF6} .muted{color:#666}
@media print{body{margin:0}}</style></head><body>
${body}
${autoPrint ? "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300))</script>" : ""}
</body></html>`;
}
