"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { analyzeSurveyAction } from "../actions";

export function AnalyzePanel({ surveyId }: { surveyId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ text: string; usedFallback: boolean } | null>(null);

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <Sparkles className="h-4 w-4" /> AI phân tích phản hồi khảo sát
        </div>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setResult(await analyzeSurveyAction(surveyId)))}>
          {pending ? "Đang phân tích…" : "Phân tích"}
        </Button>
      </div>
      {result && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
            Kết quả {result.usedFallback && <Badge color="amber">chế độ dự phòng</Badge>}
          </div>
          <p className="prose-ai text-slate-700">{result.text}</p>
        </div>
      )}
    </div>
  );
}
