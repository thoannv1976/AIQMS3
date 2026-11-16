"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, FolderArchive, GraduationCap, LayoutGrid, ListChecks, BookOpen, User, Loader2 } from "lucide-react";
import type { SearchHit } from "@/app/api/search/route";

const ICON: Record<SearchHit["kind"], React.ComponentType<{ className?: string }>> = {
  page: LayoutGrid, program: GraduationCap, evidence: FolderArchive, section: FileText, criterion: ListChecks, course: BookOpen, user: User,
};
const KIND: Record<SearchHit["kind"], string> = {
  page: "Màn hình", program: "Chương trình", evidence: "Minh chứng", section: "Mục báo cáo", criterion: "Tiêu chí", course: "Học phần", user: "Người dùng",
};

/** Ctrl/⌘+K search across pages and the user's data. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 30);
  }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: { hits: SearchHit[] }) => { setHits(d.hits ?? []); setActive(0); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const go = (h?: SearchHit) => {
    if (!h) return;
    setOpen(false);
    setQ("");
    setHits([]);
    router.push(h.href);
  };
  const list = q.trim().length < 2 ? [] : hits;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 md:flex"
        title="Tìm kiếm nhanh (Ctrl+K)"
      >
        <Search className="h-3.5 w-3.5" /> Tìm kiếm… <kbd className="rounded border border-slate-300 bg-white px-1 text-[10px]">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-4 pt-24" onMouseDown={() => setOpen(false)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-slate-100 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  else if (e.key === "Enter") go(list[active]);
                }}
                placeholder="Tìm màn hình, chương trình, minh chứng (mã/tên), mục báo cáo, tiêu chí, học phần…"
                className="h-12 flex-1 bg-transparent text-sm outline-none"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
            <ul className="max-h-96 overflow-auto py-1">
              {q.trim().length >= 2 && !loading && list.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Không tìm thấy kết quả.</li>}
              {list.map((h, i) => {
                const Icon = ICON[h.kind];
                return (
                  <li key={`${h.kind}-${h.href}-${i}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === active ? "bg-brand-50" : ""}`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="flex-1 truncate text-slate-800">{h.title}</span>
                      {h.sub && <span className="max-w-40 truncate text-xs text-slate-400">{h.sub}</span>}
                      <span className="w-24 shrink-0 text-right text-[11px] text-slate-400">{KIND[h.kind]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">↑↓ để chọn · Enter để mở · Esc để đóng</div>
          </div>
        </div>
      )}
    </>
  );
}
