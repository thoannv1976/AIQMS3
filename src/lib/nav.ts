import type { Capability } from "./rbac";

export interface NavItem {
  href: string;
  label: string;
  labelEn: string;
  icon: string; // resolved to a lucide icon in the client sidebar
  capability: Capability;
}

export interface NavGroup {
  title: string;
  titleEn: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Tổng quan",
    titleEn: "Overview",
    items: [
      { href: "/dashboard", label: "Bảng điều khiển", labelEn: "Dashboard", icon: "dashboard", capability: "dashboard:view" },
      { href: "/ai-assistant", label: "Trợ lý AI", labelEn: "AI Assistant", icon: "ai", capability: "ai:use" },
    ],
  },
  {
    title: "Chương trình & học thuật",
    titleEn: "Programs & Academics",
    items: [
      { href: "/programs", label: "Chương trình đào tạo", labelEn: "Programs", icon: "program", capability: "program:view" },
      { href: "/outcomes", label: "Chuẩn đầu ra & ma trận", labelEn: "Outcomes & Matrices", icon: "outcome", capability: "outcome:view" },
      { href: "/syllabi", label: "Đề cương học phần", labelEn: "Syllabi", icon: "syllabus", capability: "syllabus:view" },
    ],
  },
  {
    title: "Kiểm định",
    titleEn: "Accreditation",
    items: [
      { href: "/standards", label: "Bộ tiêu chuẩn", labelEn: "Standards", icon: "standard", capability: "standard:view" },
      { href: "/evidence", label: "Minh chứng", labelEn: "Evidence", icon: "evidence", capability: "evidence:view" },
      { href: "/tasks", label: "Nhiệm vụ & tiến độ", labelEn: "Tasks & Progress", icon: "task", capability: "task:view" },
      { href: "/reports", label: "Báo cáo tự đánh giá", labelEn: "Self-Assessment Report", icon: "report", capability: "report:view" },
      { href: "/improvements", label: "Cải tiến (PDCA)", labelEn: "Improvement (PDCA)", icon: "improvement", capability: "improvement:view" },
      { href: "/external-review", label: "Đánh giá ngoài & giải trình", labelEn: "External Review", icon: "external", capability: "improvement:view" },
    ],
  },
  {
    title: "Phân tích chất lượng (AI)",
    titleEn: "Quality Analytics (AI)",
    items: [
      { href: "/readiness", label: "Sẵn sàng kiểm định", labelEn: "Accreditation Readiness", icon: "readiness", capability: "dashboard:view" },
      { href: "/benchmark", label: "So sánh chương trình", labelEn: "Benchmark", icon: "benchmark", capability: "dashboard:view" },
      { href: "/curriculum-check", label: "Kiểm tra logic CTĐT", labelEn: "Curriculum Logic Check", icon: "curriculum", capability: "outcome:view" },
    ],
  },
  {
    title: "Dữ liệu & phân tích",
    titleEn: "Data & Analytics",
    items: [
      { href: "/surveys", label: "Khảo sát các bên", labelEn: "Stakeholder Surveys", icon: "survey", capability: "survey:view" },
      { href: "/obe", label: "Đạt chuẩn đầu ra (OBE)", labelEn: "Outcomes Attainment (OBE)", icon: "obe", capability: "obe:view" },
    ],
  },
  {
    title: "Hệ thống",
    titleEn: "System",
    items: [
      { href: "/audit", label: "Nhật ký hệ thống", labelEn: "Audit Log", icon: "audit", capability: "audit:view" },
      { href: "/admin/users", label: "Quản trị người dùng", labelEn: "User Management", icon: "admin", capability: "admin:users" },
      { href: "/admin/ai-config", label: "Cấu hình AI", labelEn: "AI Configuration", icon: "aiconfig", capability: "admin:settings" },
    ],
  },
];
