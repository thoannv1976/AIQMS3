import { TaskStatus } from "@/generated/prisma/enums";
import { taskStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export interface GanttItem {
  id: string;
  title: string;
  unit: string | null;
  status: TaskStatus;
  criterionCode: string | null;
  start: string;
  due: string;
  overdue: boolean;
}

const BAR_BG: Record<TaskStatus, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  REVIEW: "bg-violet-500",
  DONE: "bg-green-500",
};

export function GanttChart({ items, now }: { items: GanttItem[]; now: number }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Không có nhiệm vụ nào có mốc thời gian (hạn) để hiển thị trên Gantt.
      </div>
    );
  }

  const starts = items.map((i) => new Date(i.start).getTime());
  const dues = items.map((i) => new Date(i.due).getTime());
  let min = Math.min(...starts);
  let max = Math.max(...dues);
  const pad = (max - min) * 0.04 || 86_400_000;
  min -= pad;
  max += pad;
  const total = max - min || 1;
  const todayPct = Math.max(0, Math.min(100, ((now - min) / total) * 100));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 grid grid-cols-[180px_1fr] gap-2 text-xs text-slate-400">
        <span>Nhiệm vụ</span>
        <span className="flex justify-between">
          <span>{formatDate(new Date(min))}</span>
          <span>{formatDate(new Date(max))}</span>
        </span>
      </div>

      <div className="space-y-1.5">
        {items.map((it) => {
          const s = new Date(it.start).getTime();
          const d = new Date(it.due).getTime();
          const left = ((s - min) / total) * 100;
          const width = Math.max(1.5, ((d - s) / total) * 100);
          return (
            <div key={it.id} className="grid grid-cols-[180px_1fr] items-center gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-slate-700">{it.title}</div>
                <div className="truncate text-[11px] text-slate-400">
                  {[it.criterionCode, it.unit].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="relative h-6 rounded bg-slate-50">
                <div className="absolute bottom-0 top-0 w-px bg-red-300" style={{ left: `${todayPct}%` }} title="Hôm nay" />
                <div
                  className={`absolute bottom-0.5 top-0.5 rounded ${it.overdue ? "bg-red-500" : BAR_BG[it.status]}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${formatDate(it.start)} → ${formatDate(it.due)}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        {(Object.values(TaskStatus) as TaskStatus[]).map((st) => (
          <span key={st} className="inline-flex items-center gap-1">
            <span className={`h-2.5 w-2.5 rounded-sm ${BAR_BG[st]}`} /> {taskStatus[st].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Quá hạn
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-px bg-red-300" /> Hôm nay
        </span>
      </div>
    </div>
  );
}
