"use client";

import { useState, useTransition } from "react";
import { Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import type { BadgeColor } from "@/components/ui";
import { Progress } from "@/components/widgets";
import { reviewSyllabusAction, type SyllabusReviewResult } from "./actions";

const BAND_COLOR: Record<string, BadgeColor> = { strong: "green", adequate: "blue", weak: "amber", missing: "red" };
const BAND_LABEL: Record<string, string> = { strong: "Đầy đủ", adequate: "Khá đầy đủ", weak: "Còn thiếu", missing: "Thiếu nhiều" };

export function SyllabusReviewPanel({ courseId }: { courseId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SyllabusReviewResult | null>(null);

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <Sparkles className="h-4 w-4" /> AI rà soát đề cương (constructive alignment)
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => start(async () => setResult(await reviewSyllabusAction(courseId)))}
        >
          {pending ? "Đang phân tích…" : "Phân tích"}
        </Button>
      </div>

      {result && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              Mức đầy đủ: {result.report.score}/100{" "}
              <Badge color={BAND_COLOR[result.report.band] ?? "slate"}>
                {BAND_LABEL[result.report.band] ?? result.report.band}
              </Badge>
            </span>
            {result.usedFallback && <Badge color="amber">dự phòng</Badge>}
          </div>
          <Progress value={result.report.score} />

          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {result.report.checks.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                {c.passed ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                )}
                <span className={c.passed ? "text-slate-600" : "text-slate-400"}>{c.label}</span>
              </li>
            ))}
          </ul>

          {result.report.issues.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-slate-100 pt-2">
              {result.report.issues.map((iss, i) => (
                <li key={i} className="text-xs text-amber-700">
                  • {iss}
                </li>
              ))}
            </ul>
          )}

          <p className="prose-ai mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm text-slate-700">
            {result.text}
          </p>
        </div>
      )}
    </div>
  );
}
