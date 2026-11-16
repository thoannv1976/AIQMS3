"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp, X, Lightbulb } from "lucide-react";
import { helpFor } from "@/lib/help";

/** "?" button: opens a side panel with the steps for the current screen. */
export function HelpButton() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const h = helpFor(path);
  if (!h) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" title="Hướng dẫn màn hình này">
        <CircleHelp className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20" onMouseDown={() => setOpen(false)}>
          <aside className="h-full w-full max-w-md overflow-auto bg-white p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-brand-600">Hướng dẫn</div>
                <h2 className="text-lg font-semibold text-slate-900">{h.title}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Đóng"><X className="h-5 w-5" /></button>
            </div>
            <ol className="space-y-3">
              {h.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            {h.tips?.map((t, i) => (
              <p key={i} className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><Lightbulb className="h-4 w-4 shrink-0" /> {t}</p>
            ))}
            <p className="mt-6 text-xs text-slate-400">Mẹo chung: Ctrl+K để tìm nhanh · chuông thông báo ở góc phải · mỗi thao tác quan trọng đều được ghi nhật ký.</p>
          </aside>
        </div>
      )}
    </>
  );
}
