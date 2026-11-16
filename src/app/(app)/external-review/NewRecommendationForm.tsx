"use client";

import { useActionState } from "react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { taskPriority } from "@/lib/labels";
import { createRecommendationAction, type FormState } from "./actions";

interface CriterionOption {
  id: string;
  code: string;
  title: string;
}

export function NewRecommendationForm({ programId, criteria }: { programId: string; criteria: CriterionOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createRecommendationAction, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="programId" value={programId} />
      <div>
        <Label>Nội dung khuyến nghị</Label>
        <Textarea name="content" rows={3} required placeholder="Khuyến nghị của đoàn đánh giá ngoài…" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Đoàn / tổ chức đánh giá</Label>
          <Input name="assessor" placeholder="VD: AUN-QA, MOET…" />
        </div>
        <div>
          <Label>Đơn vị phụ trách</Label>
          <Input name="responsibleUnit" placeholder="VD: Khoa CNTT" />
        </div>
        <div>
          <Label>Tiêu chí liên quan</Label>
          <Select name="criterionId" defaultValue="">
            <option value="">— Không gắn —</option>
            {criteria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Mức ưu tiên</Label>
          <Select name="priority" defaultValue="MEDIUM">
            {Object.entries(taskPriority).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Hạn xử lý</Label>
          <Input type="date" name="dueDate" />
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">Đã ghi nhận khuyến nghị.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Đang lưu…" : "Ghi nhận khuyến nghị"}
      </Button>
    </form>
  );
}
