// Citation checking for SAR sections: every "[MC-1.1.01]"-style code must point to an
// existing, approved, still-valid evidence item linked to the section's criteria.
import { prisma } from "../db";
import { APPROVED_LIKE, validityState } from "../access";

/**
 * Codes inside square brackets that look like evidence codes: [MC-1.1.01], [E-2.3-04], [H1.01.02.03],
 * and free-form codes of 3+ segments with a digit: [01-THONG-TIN-KHAI-BAO], [DC-AIKD101-NHAP-MON].
 * Plain "[1.1]" or "[2025]" are not treated as citations.
 */
export function extractCitationCodes(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\[([A-Za-z]{1,4}[-_.]?\d[\w.\-]*)\]/g)) out.add(m[1].trim());
  // A trailing separator is allowed: bulk-upload codes are cut at 24 chars ("04-MA-TRAN-HOC-PHAN-PLO-").
  for (const m of text.matchAll(/\[([A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+){2,}[-_.]?)\]/g)) {
    if (/\d/.test(m[1])) out.add(m[1].trim());
  }
  return [...out];
}

export interface CitationCheck {
  code: string;
  found: boolean;
  evidenceId?: string;
  title?: string;
  approved: boolean;
  linkedToCriterion: boolean;
  expired: boolean;
  ok: boolean;
  problem?: string;
}

export async function checkCitations(programId: string, criterionIds: string[], text: string): Promise<CitationCheck[]> {
  const codes = extractCitationCodes(text);
  if (codes.length === 0) return [];
  const rows = await prisma.evidence.findMany({
    where: { programId, code: { in: codes } },
    select: { id: true, code: true, title: true, status: true, validUntil: true, criterionLinks: { select: { criterionId: true } } },
  });
  return codes.map((code) => {
    const e = rows.find((r) => r.code === code);
    if (!e) return { code, found: false, approved: false, linkedToCriterion: false, expired: false, ok: false, problem: "Không có minh chứng mã này trong kho" };
    const approved = APPROVED_LIKE.includes(e.status);
    const linked = e.criterionLinks.some((l) => criterionIds.includes(l.criterionId));
    const expired = validityState(e.validUntil) === "expired";
    const problem = !approved ? "Minh chứng chưa được phê duyệt" : expired ? "Minh chứng đã hết hiệu lực" : !linked ? "Minh chứng chưa gắn với tiêu chí của mục này" : undefined;
    return { code, found: true, evidenceId: e.id, title: e.title, approved, linkedToCriterion: linked, expired, ok: !problem, problem };
  });
}

/**
 * Sentences that state numbers or strong claims without any citation — likely
 * "nhận định thiếu căn cứ". Heuristic, shown as a warning only.
 */
export function uncitedClaims(text: string, max = 6): string[] {
  const sentences = text
    .replace(/\r/g, "")
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && !s.startsWith("#") && !s.startsWith(">"));
  const claim = /(\d+([.,]\d+)?\s?%|\b\d{2,}\b|đạt|vượt|cao nhất|luôn|toàn bộ|100\s?%|hằng năm|định kỳ)/i;
  return sentences.filter((s) => claim.test(s) && !/\[[^\]]+\]/.test(s) && !/Cần bổ sung/i.test(s)).slice(0, max);
}
