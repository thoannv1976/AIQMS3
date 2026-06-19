import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { resolveProgram } from "@/lib/program-context";
import { ProgramSwitcher } from "@/components/program-switcher";
import { LinkButton, PageHeader, EmptyState } from "@/components/ui";
import { taskStatus } from "@/lib/labels";
import { TaskCard, type TaskItem } from "./TaskCard";
import { TaskStatus } from "@/generated/prisma/enums";

const COLUMNS: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.REVIEW, TaskStatus.DONE];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);
  const canWrite = can(user.role, "task:write");

  const tasks = selected
    ? await prisma.task.findMany({
        where: { programId: selected.id },
        include: { criterion: true },
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      })
    : [];

  const now = Date.now();
  const items: TaskItem[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    unit: t.unit,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    criterionCode: t.criterion?.code ?? null,
    overdue: !!t.dueDate && t.dueDate.getTime() < now && t.status !== TaskStatus.DONE,
    canWrite,
  }));

  return (
    <div>
      <PageHeader
        title="Nhiệm vụ & tiến độ kiểm định"
        description="Quản lý công việc kiểm định theo bảng Kanban, phân công theo đơn vị và tiêu chí"
        actions={
          <div className="flex items-center gap-3">
            <ProgramSwitcher programs={programs} selectedId={selected?.id} />
            {selected && canWrite && (
              <LinkButton href={`/tasks/new?program=${selected.id}`}>
                <Plus className="h-4 w-4" /> Thêm nhiệm vụ
              </LinkButton>
            )}
          </div>
        }
      />

      {!selected ? (
        <EmptyState title="Chưa có chương trình" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const colTasks = items.filter((t) => t.status === col);
            return (
              <div key={col} className="rounded-xl bg-slate-100/70 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold text-slate-700">{taskStatus[col].label}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                  {colTasks.length === 0 && <p className="px-1 py-4 text-center text-xs text-slate-400">Trống</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
