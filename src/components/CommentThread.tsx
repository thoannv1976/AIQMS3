"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MessageSquare, Send, Check, Trash2, Loader2, RotateCcw } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import {
  listCommentsAction,
  addCommentAction,
  mentionableUsersAction,
  setCommentResolvedAction,
  deleteCommentAction,
  type CommentDto,
  type CommentEntity,
} from "@/app/(app)/comments/actions";

/** Render @Full Name mentions in bold. */
function renderBody(body: string, names: string[]) {
  if (!names.length) return body;
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const parts = body.split(new RegExp(`(@(?:${esc.join("|")}))`, "g"));
  return parts.map((p, i) => (p.startsWith("@") && names.includes(p.slice(1)) ? <b key={i} className="text-brand-700">{p}</b> : <span key={i}>{p}</span>));
}

export function CommentThread({ entityType, entityId, currentUserId, compact = false }: { entityType: CommentEntity; entityId: string; currentUserId: string; compact?: boolean }) {
  const [items, setItems] = useState<CommentDto[] | null>(null);
  const [text, setText] = useState("");
  const [people, setPeople] = useState<Array<{ id: string; name: string }> | null>(null);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [pending, start] = useTransition();
  const ta = useRef<HTMLTextAreaElement>(null);

  const reload = () => listCommentsAction(entityType, entityId).then(setItems).catch(() => setItems([]));
  useEffect(() => {
    let alive = true;
    listCommentsAction(entityType, entityId).then((r) => alive && setItems(r)).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [entityType, entityId]);

  const onChange = (v: string) => {
    setText(v);
    const caret = ta.current?.selectionStart ?? v.length;
    const m = /@([^\s@]{0,30}(?:\s[^\s@]{0,30}){0,3})$/.exec(v.slice(0, caret));
    if (m) {
      setQuery(m[1].toLowerCase());
      if (!people) mentionableUsersAction(entityType, entityId).then(setPeople).catch(() => setPeople([]));
    } else setQuery(null);
  };
  const pick = (u: { id: string; name: string }) => {
    const caret = ta.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@[^@]*$/, `@${u.name} `);
    setText(before + text.slice(caret));
    setMentionIds((m) => [...new Set([...m, u.id])]);
    setQuery(null);
    ta.current?.focus();
  };
  const matches = query !== null && people ? people.filter((p) => p.name.toLowerCase().includes(query)).slice(0, 6) : [];
  const names = people?.map((p) => p.name) ?? [];
  const open = items?.filter((c) => !c.resolved) ?? [];
  const shown = showResolved ? items ?? [] : open;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <MessageSquare className="h-4 w-4" /> Trao đổi ({open.length}{items && items.length > open.length ? ` · ${items.length - open.length} đã xử lý` : ""})
        {items && items.length > open.length && (
          <button type="button" className="text-xs font-normal text-slate-500 hover:underline" onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? "Ẩn đã xử lý" : "Hiện cả đã xử lý"}
          </button>
        )}
      </div>
      {items === null ? (
        <p className="text-xs text-slate-400">Đang tải…</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <li key={c.id} className={`rounded-lg border px-3 py-2 text-sm ${c.resolved ? "border-slate-100 bg-slate-50 text-slate-400" : "border-slate-200 bg-white"}`}>
              <div className="mb-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span><b className="text-slate-700">{c.authorName}</b> · {new Date(c.createdAt).toLocaleString("vi-VN")}</span>
                <span className="flex gap-1">
                  <button type="button" title={c.resolved ? "Mở lại" : "Đánh dấu đã xử lý"} onClick={() => start(async () => { await setCommentResolvedAction(c.id, !c.resolved); await reload(); })}>
                    {c.resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                  </button>
                  {c.authorId === currentUserId && (
                    <button type="button" title="Xóa" onClick={() => { if (confirm("Xóa bình luận?")) start(async () => { await deleteCommentAction(c.id); await reload(); }); }}>
                      <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  )}
                </span>
              </div>
              <div className="whitespace-pre-wrap">{renderBody(c.body, names)}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Textarea ref={ta} rows={2} value={text} onChange={(e) => onChange(e.target.value)} placeholder="Viết trao đổi… gõ @ để nhắc tên người liên quan" />
        {matches.length > 0 && (
          <ul className="absolute z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {matches.map((u) => (
              <li key={u.id}>
                <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50" onMouseDown={(e) => { e.preventDefault(); pick(u); }}>
                  {u.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending || !text.trim()}
            onClick={() => start(async () => {
              const r = await addCommentAction(entityType, entityId, text, mentionIds);
              if (r.ok) { setText(""); setMentionIds([]); setError(null); await reload(); } else setError(r.error ?? "Lỗi");
            })}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gửi
          </Button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}
