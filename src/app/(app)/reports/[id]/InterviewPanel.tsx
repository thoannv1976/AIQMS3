"use client";

import { useState, useTransition } from "react";
import { MessagesSquare, FileDown, Loader2 } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { interviewQuestionsAction } from "../actions";

/** AI-suggested interview questions of the external review panel (QA03). */
export function InterviewPanel({
  reportId,
  latest,
  canUseAi,
}: {
  reportId: string;
  latest: { text: string; createdAt: string } | null;
  canUseAi: boolean;
}) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ text: string; usedFallback: boolean; createdAt: string } | null>(
    latest ? { ...latest, usedFallback: false } : null,
  );
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
          <MessagesSquare className="h-4 w-4" /> Gợi ý câu hỏi phỏng vấn của đoàn đánh giá ngoài
          {res && <span className="text-xs font-normal text-slate-500">· cập nhật {new Date(res.createdAt).toLocaleString("vi-VN")}</span>}
          {res?.usedFallback && <Badge color="amber">dự phòng</Badge>}
        </div>
        <div className="flex gap-2">
          {res && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
                {open ? "Thu gọn" : "Xem"}
              </Button>
              <a
                href={`/reports/${reportId}/interview`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileDown className="h-3.5 w-3.5" /> Xuất Word
              </a>
            </>
          )}
          {canUseAi && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await interviewQuestionsAction(reportId);
                  setRes({ ...r, createdAt: new Date().toISOString() });
                  setOpen(true);
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessagesSquare className="h-4 w-4" />} {res ? "Tạo lại" : "AI gợi ý câu hỏi"}
            </Button>
          )}
        </div>
      </div>
      {!res && <p className="mt-1 text-xs text-slate-500">AI đọc báo cáo, tồn tại và khoảng trống minh chứng để dự kiến câu hỏi theo từng nhóm đối tượng phỏng vấn.</p>}
      {res && open && (
        <div className="mt-3 rounded-lg bg-white p-4">
          <Markdown text={res.text} />
        </div>
      )}
    </div>
  );
}
