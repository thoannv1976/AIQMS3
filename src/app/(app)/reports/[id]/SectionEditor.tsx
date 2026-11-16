"use client";

import { useState, useTransition } from "react";
import { Wand2, ClipboardCheck, Save, ChevronDown, Gauge, CheckCircle2, XCircle } from "lucide-react";
import { Button, Badge, Textarea, Select, Label } from "@/components/ui";
import type { BadgeColor } from "@/components/ui";
import { Progress } from "@/components/widgets";
import { reportSectionStatus } from "@/lib/labels";
import { saveSectionAction, draftSectionAction, reviewSectionAction, reviewSectionAdvancedAction } from "../actions";
import type { AdvancedReviewResult } from "../actions";
import { ReportSectionStatus } from "@/generated/prisma/enums";

const BAND_COLOR: Record<string, BadgeColor> = { strong: "green", adequate: "blue", weak: "amber", missing: "red" };
const BAND_LABEL: Record<string, string> = { strong: "Mạnh", adequate: "Đạt", weak: "Yếu", missing: "Thiếu" };

interface SectionData {
  id: string;
  title: string;
  content: string | null;
  strengths: string | null;
  weaknesses: string | null;
  improvementPlan: string | null;
  status: ReportSectionStatus;
  linkedCount: number;
}

export function SectionEditor({ section, canWrite }: { section: SectionData; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(section.content ?? "");
  const [strengths, setStrengths] = useState(section.strengths ?? "");
  const [weaknesses, setWeaknesses] = useState(section.weaknesses ?? "");
  const [improvementPlan, setImprovementPlan] = useState(section.improvementPlan ?? "");
  const [status, setStatus] = useState<ReportSectionStatus>(section.status);

  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<{ text: string; usedFallback: boolean } | null>(null);
  const [review, setReview] = useState<{ text: string; usedFallback: boolean } | null>(null);
  const [adv, setAdv] = useState<AdvancedReviewResult | null>(null);
  const [saved, setSaved] = useState(false);

  const meta = reportSectionStatus[status];

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          <span className="font-medium text-slate-800">{section.title}</span>
          <Badge color={section.linkedCount > 0 ? "green" : "amber"}>{section.linkedCount} MC</Badge>
        </div>
        <Badge color={meta.color}>{meta.label}</Badge>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 px-5 py-4">
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => start(async () => setDraft(await draftSectionAction(section.id)))}
              >
                <Wand2 className="h-4 w-4" /> AI soạn nháp
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => start(async () => setReview(await reviewSectionAction(section.id)))}
              >
                <ClipboardCheck className="h-4 w-4" /> AI rà soát
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => start(async () => setAdv(await reviewSectionAdvancedAction(section.id)))}
              >
                <Gauge className="h-4 w-4" /> AI rà soát nâng cao
              </Button>
            </div>
          )}

          {adv && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  Chất lượng SAR: {adv.quality.score}/100{" "}
                  <Badge color={BAND_COLOR[adv.quality.band] ?? "slate"}>{BAND_LABEL[adv.quality.band] ?? adv.quality.band}</Badge>
                </span>
                {adv.usedFallback && <Badge color="amber">dự phòng</Badge>}
              </div>
              <Progress value={adv.quality.score} />
              <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                {adv.quality.checks.map((c, i) => (
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
              <p className="prose-ai mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm text-slate-700">{adv.text}</p>
            </div>
          )}

          {draft && (
            <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Bản nháp AI {draft.usedFallback && <Badge color="amber">dự phòng</Badge>}
                </span>
                <Button size="sm" variant="outline" onClick={() => setContent(draft.text)}>
                  Áp dụng vào nội dung
                </Button>
              </div>
              <p className="prose-ai text-slate-700">{draft.text}</p>
            </div>
          )}

          {review && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <span className="text-xs font-medium text-slate-500">
                Kết quả rà soát {review.usedFallback && <Badge color="amber">dự phòng</Badge>}
              </span>
              <p className="prose-ai mt-1 text-slate-700">{review.text}</p>
            </div>
          )}

          <div>
            <Label>Mô tả hiện trạng & phân tích</Label>
            <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} disabled={!canWrite} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Điểm mạnh</Label>
              <Textarea rows={3} value={strengths} onChange={(e) => setStrengths(e.target.value)} disabled={!canWrite} />
            </div>
            <div>
              <Label>Tồn tại</Label>
              <Textarea rows={3} value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} disabled={!canWrite} />
            </div>
          </div>
          <div>
            <Label>Kế hoạch cải tiến</Label>
            <Textarea rows={3} value={improvementPlan} onChange={(e) => setImprovementPlan(e.target.value)} disabled={!canWrite} />
          </div>

          {canWrite && (
            <div className="flex items-center gap-3">
              <div className="w-48">
                <Select value={status} onChange={(e) => setStatus(e.target.value as ReportSectionStatus)}>
                  {Object.entries(reportSectionStatus).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await saveSectionAction(section.id, { content, strengths, weaknesses, improvementPlan, status });
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                  })
                }
              >
                <Save className="h-4 w-4" /> {saved ? "Đã lưu" : "Lưu"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
