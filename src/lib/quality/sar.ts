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

  const score = scoreFromChecks(checks);
  return { score, band: bandFor(score), checks };
}
