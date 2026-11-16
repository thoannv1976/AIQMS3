// Deterministic syllabus completeness & constructive-alignment checks. Feeds the
// automatic AI syllabus review.

import { bandFor, scoreFromChecks, type QualityCheck, type ScoreBand } from "./scoring";

export interface SyllabusInput {
  objectives?: string | null;
  content?: string | null;
  teachingMethods?: string | null;
  assessmentMethods?: string | null;
  materials?: string | null;
  schedule?: string | null;
  cloCount: number;
  ploMapCount: number; // curriculum-map links for the course
  cloPloLinkCount: number; // CLO→PLO links for the course
}

export interface SyllabusReport {
  score: number;
  band: ScoreBand;
  checks: QualityCheck[];
  issues: string[];
}

const nonEmpty = (s?: string | null) => Boolean(s && s.trim().length > 0);

export function assessSyllabus(input: SyllabusInput): SyllabusReport {
  const checks: QualityCheck[] = [
    { key: "objectives", label: "Có mục tiêu học phần", passed: nonEmpty(input.objectives), weight: 12 },
    { key: "content", label: "Có nội dung chi tiết", passed: nonEmpty(input.content), weight: 12 },
    { key: "teaching", label: "Có phương pháp giảng dạy", passed: nonEmpty(input.teachingMethods), weight: 12 },
    { key: "assessment", label: "Có phương pháp đánh giá", passed: nonEmpty(input.assessmentMethods), weight: 16 },
    { key: "materials", label: "Có tài liệu học tập", passed: nonEmpty(input.materials), weight: 8 },
    { key: "schedule", label: "Có kế hoạch giảng dạy (lịch trình)", passed: nonEmpty(input.schedule), weight: 8 },
    { key: "clo", label: "Đã khai báo CLO", passed: input.cloCount > 0, weight: 12 },
    { key: "clo_plo", label: "CLO liên kết tới PLO", passed: input.cloPloLinkCount > 0, weight: 12 },
    { key: "plo_map", label: "Học phần đóng góp PLO (ma trận)", passed: input.ploMapCount > 0, weight: 8 },
  ];

  const issues: string[] = [];
  if (!nonEmpty(input.assessmentMethods)) issues.push("Chưa mô tả phương pháp đánh giá — không kiểm chứng được CLO.");
  if (input.cloCount === 0) issues.push("Chưa có CLO — không thể đối sánh với phương pháp đánh giá (constructive alignment).");
  else if (input.cloPloLinkCount === 0) issues.push("CLO chưa liên kết PLO — đứt mạch PLO→CLO.");
  if (input.ploMapCount === 0) issues.push("Học phần chưa xuất hiện trong ma trận đóng góp PLO.");

  const score = scoreFromChecks(checks);
  return { score, band: bandFor(score), checks, issues };
}
