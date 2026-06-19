"use client";

import { useState, useTransition } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { analyzeMatrixAction } from "./actions";

export function GapPanel({ programId }: { programId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ text: string; usedFallback: boolean; issues: string[] } | null>(null);

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <Sparkles className="h-4 w-4" /> AI rà soát ma trận chuẩn đầu ra
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await analyzeMatrixAction(programId);
              setResult(r);
            })
          }
        >
          {pending ? "Đang phân tích…" : "Phân tích"}
        </Button>
      </div>

      {result && (
        <div className="mt-3 space-y-3">
          {result.issues.length > 0 && (
            <ul className="space-y-1.5">
              {result.issues.map((i, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  {i}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
              Nhận định {result.usedFallback && <Badge color="amber">chế độ dự phòng</Badge>}
            </div>
            <p className="prose-ai text-slate-700">{result.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
