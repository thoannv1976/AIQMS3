import type { BadgeColor } from "@/components/ui";
import {
  EvidenceStatus,
  TaskStatus,
  TaskPriority,
  ReportStatus,
  ReportSectionStatus,
  PdcaStatus,
  CycleStatus,
  ContributionLevel,
  CloPloStrength,
  SurveyAudience,
  SurveyStatus,
  DegreeLevel,
  Confidentiality,
  ProgramVersionStatus,
  SyllabusStatus,
} from "@/generated/prisma/enums";

type Meta = { label: string; color: BadgeColor };

// Document processing status (stored as a free string on Document.status).
const DOCUMENT_STATUS: Record<string, Meta> = {
  PENDING: { label: "Chờ xử lý", color: "slate" },
  PROCESSING: { label: "Đang xử lý", color: "amber" },
  READY: { label: "Đã xử lý", color: "green" },
  FAILED: { label: "Lỗi xử lý", color: "red" },
};
export function documentStatus(status: string | null | undefined): Meta {
  return (status && DOCUMENT_STATUS[status]) || { label: status || "—", color: "slate" };
}

export const evidenceStatus: Record<EvidenceStatus, Meta> = {
  UPLOADED: { label: "Đã upload", color: "blue" },
  PROCESSING: { label: "Đang xử lý", color: "amber" },
  DRAFT: { label: "Nháp", color: "slate" },
  SUBMITTED: { label: "Chờ rà soát", color: "amber" },
  REVIEWED: { label: "Đã rà soát", color: "cyan" },
  NEEDS_REVISION: { label: "Cần bổ sung", color: "red" },
  APPROVED: { label: "Đã duyệt", color: "green" },
  USED_IN_REPORT: { label: "Đã dùng báo cáo", color: "purple" },
  ARCHIVED: { label: "Lưu trữ", color: "slate" },
};

export const taskStatus: Record<TaskStatus, Meta> = {
  TODO: { label: "Cần làm", color: "slate" },
  IN_PROGRESS: { label: "Đang làm", color: "blue" },
  REVIEW: { label: "Rà soát", color: "amber" },
  DONE: { label: "Hoàn thành", color: "green" },
};

export const taskPriority: Record<TaskPriority, Meta> = {
  LOW: { label: "Thấp", color: "slate" },
  MEDIUM: { label: "Trung bình", color: "blue" },
  HIGH: { label: "Cao", color: "amber" },
  URGENT: { label: "Khẩn cấp", color: "red" },
};

export const reportStatus: Record<ReportStatus, Meta> = {
  DRAFT: { label: "Nháp", color: "slate" },
  IN_REVIEW: { label: "Đang rà soát", color: "amber" },
  APPROVED: { label: "Đã duyệt", color: "green" },
  PUBLISHED: { label: "Đã ban hành", color: "purple" },
};

export const reportSectionStatus: Record<ReportSectionStatus, Meta> = {
  NOT_STARTED: { label: "Chưa bắt đầu", color: "slate" },
  DRAFTING: { label: "Đang viết", color: "blue" },
  REVIEW: { label: "Rà soát", color: "amber" },
  DONE: { label: "Hoàn thành", color: "green" },
};

export const pdcaStatus: Record<PdcaStatus, Meta> = {
  PLAN: { label: "Plan", color: "slate" },
  DO: { label: "Do", color: "blue" },
  CHECK: { label: "Check", color: "amber" },
  ACT: { label: "Act", color: "cyan" },
  COMPLETED: { label: "Hoàn thành", color: "green" },
};

export const cycleStatus: Record<CycleStatus, Meta> = {
  PLANNING: { label: "Chuẩn bị", color: "slate" },
  SELF_ASSESSMENT: { label: "Tự đánh giá", color: "blue" },
  INTERNAL_REVIEW: { label: "Rà soát nội bộ", color: "amber" },
  EXTERNAL_REVIEW: { label: "Đánh giá ngoài", color: "purple" },
  IMPROVEMENT: { label: "Cải tiến", color: "cyan" },
  CLOSED: { label: "Kết thúc", color: "green" },
};

export const contributionLevel: Record<ContributionLevel, Meta> = {
  INTRODUCED: { label: "I — Giới thiệu", color: "slate" },
  REINFORCED: { label: "R — Củng cố", color: "blue" },
  MASTERED: { label: "M — Thành thạo", color: "green" },
};
export const contributionShort: Record<ContributionLevel, string> = {
  INTRODUCED: "I",
  REINFORCED: "R",
  MASTERED: "M",
};

export const cloPloStrength: Record<CloPloStrength, Meta> = {
  LOW: { label: "Thấp", color: "slate" },
  MEDIUM: { label: "Trung bình", color: "blue" },
  HIGH: { label: "Cao", color: "green" },
};

export const surveyAudience: Record<SurveyAudience, Meta> = {
  STUDENT: { label: "Sinh viên", color: "blue" },
  ALUMNI: { label: "Cựu sinh viên", color: "cyan" },
  LECTURER: { label: "Giảng viên", color: "purple" },
  EMPLOYER: { label: "Nhà tuyển dụng", color: "amber" },
  PARTNER: { label: "Đối tác", color: "slate" },
};

export const surveyStatus: Record<SurveyStatus, Meta> = {
  DRAFT: { label: "Nháp", color: "slate" },
  OPEN: { label: "Đang mở", color: "green" },
  CLOSED: { label: "Đã đóng", color: "slate" },
};

export const degreeLevel: Record<DegreeLevel, string> = {
  BACHELOR: "Đại học",
  MASTER: "Thạc sĩ",
  DOCTORATE: "Tiến sĩ",
};

export const confidentiality: Record<Confidentiality, Meta> = {
  PUBLIC: { label: "Công khai", color: "green" },
  INTERNAL: { label: "Nội bộ", color: "blue" },
  CONFIDENTIAL: { label: "Mật", color: "amber" },
  RESTRICTED: { label: "Hạn chế", color: "red" },
};

export const programVersionStatus: Record<ProgramVersionStatus, Meta> = {
  DRAFT: { label: "Nháp", color: "slate" },
  ACTIVE: { label: "Hiện hành", color: "green" },
  ARCHIVED: { label: "Lưu trữ", color: "slate" },
};

export const syllabusStatus: Record<SyllabusStatus, Meta> = {
  DRAFT: { label: "Nháp", color: "slate" },
  SUBMITTED: { label: "Chờ duyệt", color: "amber" },
  APPROVED: { label: "Đã duyệt", color: "green" },
  ARCHIVED: { label: "Lưu trữ", color: "slate" },
};
