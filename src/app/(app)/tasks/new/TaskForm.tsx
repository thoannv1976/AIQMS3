"use client";

import { useActionState } from "react";
import { createTask, type FormState } from "../actions";
import { Button, Input, Label, Select, Textarea, LinkButton } from "@/components/ui";

export function TaskForm({
  programId,
  criteria,
}: {
  programId: string;
  criteria: Array<{ id: string; code: string; title: string }>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTask, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="programId" value={programId} />
      <div>
        <Label htmlFor="title">Tiêu đề nhiệm vụ *</Label>
        <Input id="title" name="title" required placeholder="VD: Thu thập minh chứng tiêu chí 6.1" />
      </div>
      <div>
        <Label htmlFor="description">Mô tả</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="unit">Đơn vị phụ trách</Label>
          <Input id="unit" name="unit" placeholder="VD: Phòng CTSV" />
        </div>
        <div>
          <Label htmlFor="priority">Mức ưu tiên</Label>
          <Select id="priority" name="priority" defaultValue="MEDIUM">
            <option value="LOW">Thấp</option>
            <option value="MEDIUM">Trung bình</option>
            <option value="HIGH">Cao</option>
            <option value="URGENT">Khẩn cấp</option>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="dueDate">Hạn hoàn thành</Label>
          <Input id="dueDate" name="dueDate" type="date" />
        </div>
        <div>
          <Label htmlFor="criterionId">Tiêu chí liên quan</Label>
          <Select id="criterionId" name="criterionId" defaultValue="">
            <option value="">— Không —</option>
            {criteria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {state.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Tạo nhiệm vụ"}
        </Button>
        <LinkButton href={`/tasks?program=${programId}`} variant="outline">
          Hủy
        </LinkButton>
      </div>
    </form>
  );
}
