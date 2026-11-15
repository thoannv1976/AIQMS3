"use client";

import { useState, useTransition } from "react";
import { History, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, RotateCcw } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { reportSectionStatus } from "@/lib/labels";
import { diffText } from "@/lib/diff";
import { DiffView } from "@/components/diff-view";
import { checkCitationsAction, listSectionRevisionsAction, type CitationReport, type RevisionDto } from "../actions";

export interface SectionFields {
  content: string;
  strengths: string;
  weaknesses: string;
  improvementPlan: string;
}

/** Citation check + edit history for one SAR section. */
export function SectionTools({
  sectionId,
  current,
  onRestore,
}: {
  sectionId: string;
  current: SectionFields;
  onRestore: (f: SectionFields) => void;
}) {
  const [pending, start] = useTransition();
  const [cite, setCite] = useState<CitationReport | null>(null);
  const [revs, setRevs] = useState<RevisionDto[] | null>(null);
  const [selected, setSelected] = useState<RevisionDto | null>(null);
  const all = (f: SectionFields) => [f.content, f.strengths, f.weaknesses, f.improvementPlan].join("\n");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => start(async () => setCite(await checkCitationsAction(sectionId, all(current))))}
        >
          <ShieldCheck className="h-4 w-4" /> Kiểm tra trích dẫn
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setRevs(await listSectionRevisionsAction(sectionId));
              setSelected(null);
            })
          }
        >
          <History className="h-4 w-4" /> Lịch sử chỉnh sửa
        </Button>
      </div>

      {cite && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="mb-2 font-semibold text-slate-700">Kiểm tra trích dẫn minh chứng</div>
          {cite.checks.length === 0 ? (
            <p className="text-amber-700">Chưa có trích dẫn nào dạng [Mã minh chứng]. Mọi nhận định cần dẫn chứng từ minh chứng đã duyệt.</p>
          ) : (
            <ul className="space-y-1">
              {cite.checks.map((c) => (
                <li key={c.code} className="flex items-start gap-1.5">
                  {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                  <span>
                    <b>[{c.code}]</b> {c.title ? `— ${c.title}` : ""} {c.ok ? <span className="text-green-700">hợp lệ</span> : <span className="text-red-700">{c.problem}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {cite.uncited.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <div className="flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-4 w-4" /> Nhận định có số liệu/khẳng định nhưng chưa có trích dẫn:
              </div>
              <ul className="ml-5 list-disc text-slate-600">
                {cite.uncited.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {revs && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="mb-2 font-semibold text-slate-700">Lịch sử chỉnh sửa ({revs.length} lần lưu)</div>
          {revs.length === 0 && <p className="text-slate-500">Chưa có lần lưu nào.</p>}
          <div className="flex flex-wrap gap-1.5">
            {revs.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`rounded border px-2 py-1 text-xs ${selected?.id === r.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}
              >
                {new Date(r.createdAt).toLocaleString("vi-VN")} · {r.editor ?? "—"}
              </button>
            ))}
          </div>
          {selected && (
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  So sánh bản lưu {new Date(selected.createdAt).toLocaleString("vi-VN")} (<span className="text-red-700">đỏ</span>) với nội dung đang soạn (
                  <span className="text-green-700">xanh</span>) · trạng thái lúc đó: <Badge color={reportSectionStatus[selected.status].color}>{reportSectionStatus[selected.status].label}</Badge>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onRestore({
                      content: selected.content ?? "",
                      strengths: selected.strengths ?? "",
                      weaknesses: selected.weaknesses ?? "",
                      improvementPlan: selected.improvementPlan ?? "",
                    })
                  }
                >
                  <RotateCcw className="h-4 w-4" /> Khôi phục bản này vào ô soạn
                </Button>
              </div>
              <DiffView parts={diffText(all({ content: selected.content ?? "", strengths: selected.strengths ?? "", weaknesses: selected.weaknesses ?? "", improvementPlan: selected.improvementPlan ?? "" }), all(current))} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
