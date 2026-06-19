"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { Badge, Select } from "@/components/ui";
import { taskPriority, taskStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { updateTaskStatusAction } from "./actions";
import { TaskStatus, TaskPriority } from "@/generated/prisma/enums";

export interface TaskItem {
  id: string;
  title: string;
  unit: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  criterionCode: string | null;
  overdue: boolean;
  canWrite: boolean;
}

export function TaskCard({ task }: { task: TaskItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{task.title}</p>
        <Badge color={taskPriority[task.priority].color}>{taskPriority[task.priority].label}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {task.criterionCode && <Badge color="slate">{task.criterionCode}</Badge>}
        {task.unit && <span>{task.unit}</span>}
        {task.dueDate && (
          <span className={`inline-flex items-center gap-1 ${task.overdue ? "font-medium text-red-500" : ""}`}>
            <Clock className="h-3 w-3" /> {formatDate(task.dueDate)}
          </span>
        )}
      </div>
      {task.canWrite && (
        <Select
          className="mt-2 h-8 text-xs"
          value={task.status}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              await updateTaskStatusAction(task.id, e.target.value as TaskStatus);
              router.refresh();
            })
          }
        >
          {Object.entries(taskStatus).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
