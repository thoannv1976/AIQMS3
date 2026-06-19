import { Role } from "@/generated/prisma/enums";

// Capability-based access control. Each role maps to a set of capabilities.
// ADMIN implicitly has every capability.
export type Capability =
  | "dashboard:view"
  | "program:view"
  | "program:write"
  | "standard:view"
  | "standard:write"
  | "outcome:view"
  | "outcome:write"
  | "syllabus:view"
  | "syllabus:write"
  | "evidence:view"
  | "evidence:write"
  | "evidence:approve"
  | "task:view"
  | "task:write"
  | "report:view"
  | "report:write"
  | "report:approve"
  | "survey:view"
  | "survey:write"
  | "obe:view"
  | "obe:write"
  | "improvement:view"
  | "improvement:write"
  | "ai:use"
  | "audit:view"
  | "admin:users";

const VIEW_ALL: Capability[] = [
  "dashboard:view",
  "program:view",
  "standard:view",
  "outcome:view",
  "syllabus:view",
  "evidence:view",
  "task:view",
  "report:view",
  "survey:view",
  "obe:view",
  "improvement:view",
  "ai:use",
];

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  ADMIN: [], // handled as wildcard
  BOARD: [...VIEW_ALL, "audit:view", "report:approve"],
  QA_OFFICE: [
    ...VIEW_ALL,
    "program:write",
    "standard:write",
    "outcome:write",
    "syllabus:write",
    "evidence:write",
    "evidence:approve",
    "task:write",
    "report:write",
    "report:approve",
    "survey:write",
    "obe:write",
    "improvement:write",
    "audit:view",
  ],
  TRAINING_OFFICE: [...VIEW_ALL, "program:write", "outcome:write", "evidence:write", "task:write", "obe:write"],
  FACULTY: [
    ...VIEW_ALL,
    "program:write",
    "outcome:write",
    "syllabus:write",
    "evidence:write",
    "evidence:approve",
    "task:write",
    "report:write",
    "survey:write",
    "obe:write",
    "improvement:write",
  ],
  DEPARTMENT: [...VIEW_ALL, "outcome:write", "syllabus:write", "evidence:write", "task:write", "obe:write", "improvement:write"],
  LECTURER: [...VIEW_ALL, "outcome:write", "syllabus:write", "evidence:write"],
  HR_OFFICE: [...VIEW_ALL, "evidence:write"],
  LIBRARY: [...VIEW_ALL, "evidence:write"],
  IT_CENTER: [...VIEW_ALL, "evidence:write"],
  STUDENT_AFFAIRS: [...VIEW_ALL, "evidence:write", "survey:write"],
};

export function can(role: Role, capability: Capability): boolean {
  if (role === Role.ADMIN) return true;
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function canAny(role: Role, capabilities: Capability[]): boolean {
  return capabilities.some((c) => can(role, c));
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Quản trị hệ thống",
  BOARD: "Ban Giám hiệu",
  QA_OFFICE: "Phòng Khảo thí & ĐBCL",
  TRAINING_OFFICE: "Phòng Đào tạo",
  FACULTY: "Khoa / Viện",
  DEPARTMENT: "Bộ môn",
  LECTURER: "Giảng viên",
  HR_OFFICE: "Phòng Tổ chức nhân sự",
  LIBRARY: "Thư viện",
  IT_CENTER: "Trung tâm CNTT",
  STUDENT_AFFAIRS: "Phòng Công tác sinh viên",
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}
