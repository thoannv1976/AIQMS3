"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitSurveyAction, type PublicSurveyState } from "./actions";

const LIKERT = [
  { v: 1, l: "Rất không đồng ý" },
  { v: 2, l: "Không đồng ý" },
  { v: 3, l: "Phân vân" },
  { v: 4, l: "Đồng ý" },
  { v: 5, l: "Rất đồng ý" },
];

export function PublicSurveyForm({
  token,
  questions,
}: {
  token: string;
  questions: Array<{ id: string; text: string; type: string; options: string[] }>;
}) {
  const [state, action, pending] = useActionState<PublicSurveyState, FormData>(submitSurveyAction.bind(null, token), {});
  if (state.done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-green-200 bg-white p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <div className="text-lg font-semibold text-slate-800">Cảm ơn bạn đã tham gia khảo sát!</div>
        <p className="text-sm text-slate-500">Ý kiến của bạn đã được ghi nhận.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <legend className="sr-only">Câu {i + 1}</legend>
          <div className="mb-3 text-sm font-medium text-slate-800">
            {i + 1}. {q.text}
          </div>
          {q.type === "LIKERT" && (
            <div className="grid grid-cols-5 gap-1.5">
              {LIKERT.map((o) => (
                <label key={o.v} className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-slate-200 px-1 py-2 text-center text-[11px] text-slate-600 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input type="radio" name={`q_${q.id}`} value={o.v} className="accent-brand-600" />
                  <span className="font-semibold text-slate-800">{o.v}</span>
                  <span className="hidden sm:block">{o.l}</span>
                </label>
              ))}
            </div>
          )}
          {(q.type === "SINGLE_CHOICE" || q.type === "MULTI_CHOICE") && (
            <div className="space-y-1.5">
              {q.options.map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type={q.type === "SINGLE_CHOICE" ? "radio" : "checkbox"} name={`q_${q.id}`} value={o} className="accent-brand-600" />
                  {o}
                </label>
              ))}
            </div>
          )}
          {q.type === "OPEN" && (
            <textarea name={`q_${q.id}`} rows={3} maxLength={2000} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          )}
        </fieldset>
      ))}
      {state.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
        {pending ? "Đang gửi…" : "Gửi phản hồi"}
      </button>
    </form>
  );
}
