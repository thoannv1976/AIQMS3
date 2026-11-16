"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { criterionGapAnalysisAction } from "./actions";

export function GapAnalysisPanel({ programId, criterionId }: { programId: string; criterionId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ text: string; usedFallback: boolean } | null>(null);

  return (
    <div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => start(async () => setResult(await criterionGapAnalysisAction(programId, criterionId)))}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {pending ? "Đang phân tích…" : "AI phân tích khoảng trống"}
      </Button>

      {result && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
            Phân tích khoảng trống {result.usedFallback && <Badge color="amber">chế độ dự phòng</Badge>}
          </div>
          <p className="prose-ai whitespace-pre-wrap text-sm text-slate-700">{result.text}</p>
        </div>
      )}
    </div>
  );
}
