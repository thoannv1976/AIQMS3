"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { leadershipBriefAction } from "./actions";

/** AI leadership brief (cached per scope; "Phân tích lại" re-runs it). */
export function BriefPanel({
  facultyId,
  latest,
  canUseAi,
}: {
  facultyId: string | null;
  latest: { text: string; createdAt: string } | null;
  canUseAi: boolean;
}) {
  const [pending, start] = useTransition();
  const [brief, setBrief] = useState<{ text: string; createdAt: string; usedFallback?: boolean } | null>(latest);
  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-purple-900">
          <Sparkles className="h-4 w-4" /> AI nhận định cho lãnh đạo
          {brief && <span className="text-xs font-normal text-slate-500">· {new Date(brief.createdAt).toLocaleString("vi-VN")}</span>}
          {brief?.usedFallback && <Badge color="amber">dự phòng</Badge>}
        </div>
        {canUseAi && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setBrief(await leadershipBriefAction(facultyId)))}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {brief ? "Phân tích lại" : "AI phân tích"}
          </Button>
        )}
      </div>
      {brief ? (
        <div className="mt-3 rounded-lg bg-white p-4">
          <Markdown text={brief.text} />
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-500">AI đọc số liệu của phạm vi đang xem (mức sẵn sàng, minh chứng, việc quá hạn, PDCA, hoạt động 30 ngày) để nêu xu hướng và việc ưu tiên.</p>
      )}
    </div>
  );
}
