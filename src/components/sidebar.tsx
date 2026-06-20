"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GraduationCap,
  Target,
  BookOpen,
  ClipboardCheck,
  FolderArchive,
  KanbanSquare,
  FileText,
  TrendingUp,
  MessageSquareText,
  BarChart3,
  ScrollText,
  Settings,
  Sparkles,
  KeyRound,
  Gauge,
  Workflow,
  Gavel,
  BarChartBig,
  CheckCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  ai: Sparkles,
  program: GraduationCap,
  outcome: Target,
  syllabus: BookOpen,
  standard: ClipboardCheck,
  evidence: FolderArchive,
  task: KanbanSquare,
  report: FileText,
  improvement: TrendingUp,
  survey: MessageSquareText,
  obe: BarChart3,
  audit: ScrollText,
  admin: Settings,
  aiconfig: KeyRound,
  readiness: Gauge,
  curriculum: Workflow,
  external: Gavel,
  benchmark: BarChartBig,
  approval: CheckCheck,
};

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">A</div>
        <div className="leading-tight">
          <div className="font-bold text-slate-900">AIQMS3</div>
          <div className="text-[11px] text-slate-500">ĐBCL & Kiểm định CTĐT</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.title} className="mb-5">
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group.title}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon] ?? LayoutDashboard;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-3 text-[11px] text-slate-400">
        Bản MVP — AI hỗ trợ, người phê duyệt
      </div>
    </aside>
  );
}
