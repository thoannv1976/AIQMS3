"use client";

import { useActionState, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { createImprovement, suggestImprovementAction, type FormState } from "../actions";
import { Button, Input, Label, Select, Textarea, LinkButton, Badge } from "@/components/ui";

export function ImprovementForm({
  programId,
  criteria,
}: {
  programId: string;
  criteria: Array<{ id: string; code: string; title: string }>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createImprovement, {});
  const [problem, setProblem] = useState("");
  const [actionText, setActionText] = useState("");
  const [aiPending, startAi] = useTransition();
  const [suggestion, setSuggestion] = useState<{ text: string; usedFallback: boolean } | null>(null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="programId" value={programId} />

      <div>
        <Label htmlFor="problem">Vấn đề / tồn tại cần cải tiến *</Label>
        <Textarea id="problem" name="problem" rows={2} required value={problem} onChange={(e) => setProblem(e.target.value)} />
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={aiPending || !problem.trim()}
          onClick={() => startAi(async () => setSuggestion(await suggestImprovementAction(problem)))}
        >
          <Sparkles className="h-4 w-4" /> {aiPending ? "Đang gợi ý…" : "AI gợi ý hành động cải tiến"}
        </Button>
      </div>

      {suggestion && (
        <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Gợi ý AI {suggestion.usedFallback && <Badge color="amber">dự phòng</Badge>}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => setActionText(suggestion.text)}>
              Dùng làm hành động
            </Button>
          </div>
          <p className="prose-ai text-slate-700">{suggestion.text}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="rootCause">Nguyên nhân</Label>
          <Textarea id="rootCause" name="rootCause" rows={2} />
        </div>
        <div>
          <Label htmlFor="action">Hành động cải tiến</Label>
          <Textarea id="action" name="action" rows={2} value={actionText} onChange={(e) => setActionText(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="responsibleUnit">Đơn vị phụ trách</Label>
          <Input id="responsibleUnit" name="responsibleUnit" />
        </div>
        <div>
          <Label htmlFor="kpi">Chỉ số đánh giá (KPI)</Label>
          <Input id="kpi" name="kpi" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="source">Nguồn phát hiện</Label>
          <Select id="source" name="source" defaultValue="SAR">
            <option value="SAR">Báo cáo TĐG</option>
            <option value="External review">Đánh giá ngoài</option>
            <option value="OBE">Đạt chuẩn đầu ra</option>
            <option value="Survey">Khảo sát</option>
          </Select>
        </div>
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
          {pending ? "Đang lưu…" : "Tạo kế hoạch cải tiến"}
        </Button>
        <LinkButton href={`/improvements?program=${programId}`} variant="outline">
          Hủy
        </LinkButton>
      </div>
    </form>
  );
}
