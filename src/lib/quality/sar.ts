// Deterministic SAR (self-assessment report) section quality rubric. Produces a
// transparent 0–100 quality score + checklist that the advanced AI review builds on.

import { bandFor, scoreFromChecks, type QualityCheck, type ScoreBand } from "./scoring";

export interface SarSectionInput {
  content?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  improvementPlan?: string | null;
  linkedEvidenceCount: number;
  approvedEvidenceCount: number;
  avgEvidenceStrength: number; // 0–100
  /** Result of the citation check, when available: total [MC-…] codes and how many are invalid. */
  citations?: { total: number; invalid: number; uncitedClaims: number };
}

export interface SarQuality {
  score: number;
  band: ScoreBand;
  checks: QualityCheck[];
}

const nonEmpty = (s?: string | null) => Boolean(s && s.trim().length > 0);

export function assessSarQuality(input: SarSectionInput): SarQuality {
  const content = input.content ?? "";
  const checks: QualityCheck[] = [
    {
      key: "described",
      label: "Mô tả hiện trạng đủ chi tiết (≥ 300 ký tự)",
      passed: content.trim().length >= 300,
      weight: 15,
      hint: "Bổ sung mô tả hiện trạng và phân tích cụ thể hơn.",
    },
    {
      key: "quantified",
      label: "Có số liệu định lượng minh hoạ",
      passed: /\d/.test(content),
      weight: 15,
      hint: "Thêm số liệu (tỷ lệ, số lượng, năm…) để tăng tính thuyết phục.",
    },
    {
      key: "strengths",
      label: "Đã nêu điểm mạnh",
      passed: nonEmpty(input.strengths),
      weight: 10,
      hint: "Bổ sung phần điểm mạnh.",
    },
    {
      key: "weaknesses",
      label: "Đã nêu tồn tại",
      passed: nonEmpty(input.weaknesses),
      weight: 10,
      hint: "Bổ sung phần tồn tại/hạn chế.",
    },
    {
      key: "plan",
      label: "Có kế hoạch cải tiến",
      passed: nonEmpty(input.improvementPlan),
      weight: 15,
      hint: "Bổ sung kế hoạch cải tiến (PDCA).",
    },
    {
      key: "evidence",
      label: "Có minh chứng liên kết",
      passed: input.linkedEvidenceCount > 0,
      weight: 15,
      hint: "Liên kết tối thiểu 1–2 minh chứng cho tiêu chí.",
    },
    {
      key: "approved",
      label: "Có minh chứng đã được phê duyệt",
      passed: input.approvedEvidenceCount > 0,
      weight: 10,
      hint: "Đưa minh chứng qua quy trình duyệt.",
    },
    {
      key: "evidence_strong",
      label: "Minh chứng đủ mạnh (độ mạnh TB ≥ 50)",
      passed: input.avgEvidenceStrength >= 50,
      weight: 10,
      hint: "Nâng chất lượng minh chứng (đính kèm tệp, trích xuất, phê duyệt).",
    },
  ];

  // A section is not "strong" while its citations point to missing, unapproved, expired or
  // unlinked evidence, or while key claims carry no citation at all.
  if (input.citations) {
    const { total, invalid, uncitedClaims } = input.citations;
    checks.push(
      {
        key: "citations_valid",
        label: invalid ? `Trích dẫn minh chứng hợp lệ (${invalid}/${total} trích dẫn có vấn đề)` : "Trích dẫn minh chứng hợp lệ",
        passed: total > 0 && invalid === 0,
        weight: 20,
        hint: total
          ? "Sửa các trích dẫn sai: gắn minh chứng vào tiêu chí, duyệt hoặc thay minh chứng hết hiệu lực, hoặc bỏ trích dẫn."
          : "Trích dẫn minh chứng dạng [MC-x.y.zz] ngay tại các nhận định.",
      },
      {
        key: "claims_cited",
        label: uncitedClaims ? `Nhận định có số liệu đều có trích dẫn (${uncitedClaims} chỗ thiếu)` : "Nhận định có số liệu đều có trích dẫn",
        passed: uncitedClaims === 0,
        weight: 10,
        hint: "Thêm trích dẫn minh chứng vào các câu nêu số liệu hoặc khẳng định.",
      },
    );
  }

  const score = scoreFromChecks(checks);
  return { score, band: bandFor(score), checks };
}
