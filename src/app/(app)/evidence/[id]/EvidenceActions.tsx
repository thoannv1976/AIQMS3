"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Wand2, CheckCircle2, Link2 } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import {
  summarizeEvidenceAction,
  suggestCriteriaAction,
  linkCriterionAction,
  setEvidenceStatusAction,
} from "../actions";
import { EvidenceStatus } from "@/generated/prisma/enums";

interface Suggestion {
  id: string;
  code: string;
  title: string;
  score: number;
}

export function AiPanel({ evidenceId, canWrite }: { evidenceId: string; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<{ text: string; usedFallback: boolean } | null>(null);
  const [suggest, setSuggest] = useState<{ text: string; usedFallback: boolean; suggestions: Suggestion[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-800">
        <Sparkles className="h-4 w-4" /> Trợ lý AI cho minh chứng
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() => {
            setBusy("summary");
            start(async () => {
              const r = await summarizeEvidenceAction(evidenceId);
              setSummary(r);
              setBusy(null);
              router.refresh();
            });
          }}
        >
          <Wand2 className="h-4 w-4" /> {busy === "summary" ? "Đang tóm tắt…" : "Tóm tắt nội dung"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() => {
            setBusy("suggest");
            start(async () => {
              const r = await suggestCriteriaAction(evidenceId);
              setSuggest(r);
              setBusy(null);
            });
          }}
        >
          <Sparkles className="h-4 w-4" /> {busy === "suggest" ? "Đang phân tích…" : "Gợi ý tiêu chí"}
        </Button>
      </div>

      {summary && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
            Tóm tắt {summary.usedFallback && <Badge color="amber">chế độ dự phòng</Badge>}
          </div>
          <p className="prose-ai text-slate-700">{summary.text}</p>
        </div>
      )}

      {suggest && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
            Gợi ý tiêu chí {suggest.usedFallback && <Badge color="amber">chế độ dự phòng</Badge>}
          </div>
          {suggest.suggestions.length === 0 ? (
            <p className="text-sm text-slate-500">Không tìm thấy tiêu chí phù hợp.</p>
          ) : (
            <ul className="space-y-1.5">
              {suggest.suggestions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium text-slate-800">{s.code}</span> — {s.title}{" "}
                    <span className="text-xs text-slate-400">({s.score})</span>
                  </span>
                  {canWrite && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          await linkCriterionAction(evidenceId, s.id, true);
                          router.refresh();
                        })
                      }
                    >
                      <Link2 className="h-3.5 w-3.5" /> Gắn
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-400">AI chỉ gợi ý; người phụ trách quyết định gắn tiêu chí.</p>
        </div>
      )}
    </div>
  );
}

export function StatusControl({
  evidenceId,
  current,
  canApprove,
  canWrite,
}: {
  evidenceId: string;
  current: EvidenceStatus;
  canApprove: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const update = (status: EvidenceStatus) =>
    start(async () => {
      await setEvidenceStatusAction(evidenceId, status);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {canWrite && current !== EvidenceStatus.SUBMITTED && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => update(EvidenceStatus.SUBMITTED)}>
          Gửi rà soát
        </Button>
      )}
      {canWrite && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => update(EvidenceStatus.NEEDS_REVISION)}>
          Cần bổ sung
        </Button>
      )}
      {canApprove && current !== EvidenceStatus.APPROVED && (
        <Button size="sm" disabled={pending} onClick={() => update(EvidenceStatus.APPROVED)}>
          <CheckCircle2 className="h-4 w-4" /> Phê duyệt
        </Button>
      )}
    </div>
  );
}
