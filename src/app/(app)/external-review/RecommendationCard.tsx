"use client";

import { useState, useTransition } from "react";
import { Sparkles, Save } from "lucide-react";
import { Card, CardContent, Badge, Button, Textarea, Select } from "@/components/ui";
import { taskPriority, pdcaStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { respondRecommendationAction, draftResponseAction } from "./actions";
import { PdcaStatus, TaskPriority } from "@/generated/prisma/enums";

export interface RecommendationDto {
  id: string;
  content: string;
  assessor: string | null;
  criterion: { code: string; title: string } | null;
  priority: TaskPriority;
  status: PdcaStatus;
  responsibleUnit: string | null;
  dueDate: string | null;
  response: string | null;
  respondedAt: string | null;
}

export function RecommendationCard({ rec, canWrite }: { rec: RecommendationDto; canWrite: boolean }) {
  const [response, setResponse] = useState(rec.response ?? "");
  const [status, setStatus] = useState<PdcaStatus>(rec.status);
  const [pending, start] = useTransition();
  const [fallback, setFallback] = useState<boolean | null>(null);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {rec.assessor && <Badge color="purple">{rec.assessor}</Badge>}
          {rec.criterion && <Badge color="slate">{rec.criterion.code}</Badge>}
          <Badge color={taskPriority[rec.priority].color}>{taskPriority[rec.priority].label}</Badge>
          <Badge color={pdcaStatus[rec.status].color}>{pdcaStatus[rec.status].label}</Badge>
          {rec.respondedAt && <span className="text-xs text-green-600">Đã giải trình</span>}
        </div>

        <p className="text-sm font-medium text-slate-800">{rec.content}</p>
        <div className="flex flex-wrap gap-x-4 text-xs text-slate-500">
          {rec.responsibleUnit && <span>Phụ trách: {rec.responsibleUnit}</span>}
          {rec.dueDate && <span>Hạn: {formatDate(rec.dueDate)}</span>}
        </div>

        {canWrite ? (
          <form action={respondRecommendationAction.bind(null, rec.id)} className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Giải trình của đơn vị</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await draftResponseAction(rec.id);
                    setResponse(r.text);
                    setFallback(r.usedFallback);
                  })
                }
              >
                <Sparkles className="h-3.5 w-3.5" /> {pending ? "Đang soạn…" : "AI gợi ý giải trình"}
              </Button>
            </div>
            {fallback != null && fallback && <Badge color="amber">AI chế độ dự phòng</Badge>}
            <Textarea
              name="response"
              rows={4}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Nội dung tiếp thu, hiện trạng, hành động khắc phục, mốc thời gian…"
            />
            <div className="flex items-center gap-2">
              <div className="w-44">
                <Select value={status} onChange={(e) => setStatus(e.target.value as PdcaStatus)} name="status">
                  {Object.entries(pdcaStatus).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" size="sm">
                <Save className="h-4 w-4" /> Lưu giải trình
              </Button>
            </div>
          </form>
        ) : (
          rec.response && (
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Giải trình của đơn vị</div>
              <p className="prose-ai whitespace-pre-wrap text-sm text-slate-700">{rec.response}</p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
