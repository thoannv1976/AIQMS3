"use client";

import { useState, useTransition } from "react";
import { Sparkles, ArrowRightCircle } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { analyzeSurveyAction } from "../actions";
import { Markdown } from "@/components/markdown";

/** Pull the first meaningful line after a heading containing one of the keywords. */
function pick(text: string, keywords: RegExp): string {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const i = lines.findIndex((l) => keywords.test(l));
  const body = (i >= 0 ? lines.slice(i + 1) : lines).filter((l) => l && !l.startsWith("#"));
  return (body[0] ?? "").replace(/^([-*•]|\d+[.)])\s*/, "").replace(/\*\*/g, "").slice(0, 400);
}

export function AnalyzePanel({
  surveyId,
  programId,
  criterionId,
  canWrite,
}: {
  surveyId: string;
  programId: string;
  criterionId: string | null;
  canWrite: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ text: string; usedFallback: boolean } | null>(null);

  const improvementHref = result
    ? `/improvements/new?${new URLSearchParams({
        program: programId,
        source: "Survey",
        problem: pick(result.text, /(vấn đề|tồn tại|điểm cần cải thiện|hạn chế)/i) || "Vấn đề nổi bật từ khảo sát các bên liên quan",
        action: pick(result.text, /(khuyến nghị|đề xuất|hành động|giải pháp)/i),
        ...(criterionId ? { criterion: criterionId } : {}),
      }).toString()}`
    : "#";

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <Sparkles className="h-4 w-4" /> AI phân tích phản hồi khảo sát
        </div>
        <div className="flex gap-2">
          {result && canWrite && (
            <a
              href={improvementHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowRightCircle className="h-3.5 w-3.5" /> Chuyển thành kế hoạch cải tiến
            </a>
          )}
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setResult(await analyzeSurveyAction(surveyId)))}>
            {pending ? "Đang phân tích…" : "Phân tích"}
          </Button>
        </div>
      </div>
      {result && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
            Kết quả {result.usedFallback && <Badge color="amber">chế độ dự phòng</Badge>}
          </div>
          <Markdown text={result.text ?? ""} />
        </div>
      )}
    </div>
  );
}
