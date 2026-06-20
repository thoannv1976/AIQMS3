import type { Capability } from "./rbac";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // resolved to a lucide icon in the client sidebar
  capability: Capability;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Tổng quan",
    items: [
      { href: "/dashboard", label: "Bảng điều khiển", icon: "dashboard", capability: "dashboard:view" },
      { href: "/ai-assistant", label: "Trợ lý AI", icon: "ai", capability: "ai:use" },
    ],
  },
  {
    title: "Chương trình & học thuật",
    items: [
      { href: "/programs", label: "Chương trình đào tạo", icon: "program", capability: "program:view" },
      { href: "/outcomes", label: "Chuẩn đầu ra & ma trận", icon: "outcome", capability: "outcome:view" },
      { href: "/syllabi", label: "Đề cương học phần", icon: "syllabus", capability: "syllabus:view" },
    ],
  },
  {
    title: "Kiểm định",
    items: [
      { href: "/standards", label: "Bộ tiêu chuẩn", icon: "standard", capability: "standard:view" },
      { href: "/evidence", label: "Minh chứng", icon: "evidence", capability: "evidence:view" },
      { href: "/tasks", label: "Nhiệm vụ & tiến độ", icon: "task", capability: "task:view" },
      { href: "/reports", label: "Báo cáo tự đánh giá", icon: "report", capability: "report:view" },
      { href: "/improvements", label: "Cải tiến (PDCA)", icon: "improvement", capability: "improvement:view" },
    ],
  },
  {
    title: "Phân tích chất lượng (AI)",
    items: [
      { href: "/readiness", label: "Sẵn sàng kiểm định", icon: "readiness", capability: "dashboard:view" },
      { href: "/curriculum-check", label: "Kiểm tra logic CTĐT", icon: "curriculum", capability: "outcome:view" },
    ],
  },
  {
    title: "Dữ liệu & phân tích",
    items: [
      { href: "/surveys", label: "Khảo sát các bên", icon: "survey", capability: "survey:view" },
      { href: "/obe", label: "Đạt chuẩn đầu ra (OBE)", icon: "obe", capability: "obe:view" },
    ],
  },
  {
    title: "Hệ thống",
    items: [
      { href: "/audit", label: "Nhật ký hệ thống", icon: "audit", capability: "audit:view" },
      { href: "/admin/users", label: "Quản trị người dùng", icon: "admin", capability: "admin:users" },
      { href: "/admin/ai-config", label: "Cấu hình AI", icon: "aiconfig", capability: "admin:settings" },
    ],
  },
];
