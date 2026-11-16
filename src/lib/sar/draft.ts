// Split an AI SAR draft (Markdown with fixed headings) into the four section fields.
// Pure function: used by the section editor ("Áp dụng") and by tests.

export interface SarDraftFields {
  content: string;
  strengths: string;
  weaknesses: string;
  improvementPlan: string;
}

type FieldKey = keyof SarDraftFields;

const HEADING_KEYS: Array<{ key: FieldKey; re: RegExp }> = [
  { key: "strengths", re: /điểm\s+mạnh/i },
  { key: "weaknesses", re: /tồn\s+tại|điểm\s+(cần\s+cải\s+thiện|yếu)/i },
  { key: "improvementPlan", re: /kế\s+hoạch\s+(cải\s+tiến|hành\s+động)/i },
];

/** A heading line: "## …", "### 3. …", or a bold-only line "**3. Điểm mạnh**" / "**Điểm mạnh:**". */
function headingText(line: string): string | null {
  const t = line.trim();
  const h = t.match(/^#{1,6}\s+(.*)$/);
  if (h) return h[1];
  const b = t.match(/^\*\*([^*]{2,80})\*\*:?\s*$/);
  return b ? b[1] : null;
}

export function splitSarDraft(text: string): SarDraftFields {
  const out: Record<FieldKey, string[]> = { content: [], strengths: [], weaknesses: [], improvementPlan: [] };
  let cur: FieldKey = "content";
  let found = false;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const h = headingText(raw);
    if (h) {
      const hit = HEADING_KEYS.find((k) => k.re.test(h));
      if (hit) {
        cur = hit.key;
        found = true;
        continue;
      }
      // Drop the document-level title lines ("# BÁO CÁO TỰ ĐÁNH GIÁ", "## Tiêu chí 1.1").
      if (cur === "content" && (/^báo cáo tự đánh giá/i.test(h) || /^tiêu chí\s+\d/i.test(h))) continue;
    }
    out[cur].push(raw);
  }
  const clean = (lines: string[]) =>
    lines
      .join("\n")
      .replace(/^\s*-{3,}\s*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  if (!found) return { content: clean(out.content), strengths: "", weaknesses: "", improvementPlan: "" };
  return { content: clean(out.content), strengths: clean(out.strengths), weaknesses: clean(out.weaknesses), improvementPlan: clean(out.improvementPlan) };
}
