"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Save, Wand2, ScanSearch, Loader2, Check } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge, Th, Td } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { saveFactAction, deleteFactAction, suggestFactsAction, acceptFactsAction, checkFactsAction } from "./actions";
import type { FactSuggestion } from "@/lib/ai/features";

interface Fact { id: string; groupName: string | null; label: string; value: string; unit: string | null; period: string | null; sourceCode: string | null; note: string | null }

const COLS: Array<{ k: keyof Fact; label: string; w: string }> = [
  { k: "groupName", label: "Nhóm", w: "w-28" },
  { k: "label", label: "Số liệu", w: "min-w-56" },
  { k: "value", label: "Giá trị", w: "w-24" },
  { k: "unit", label: "Đơn vị", w: "w-20" },
  { k: "period", label: "Kỳ / khóa", w: "w-28" },
  { k: "sourceCode", label: "MC nguồn", w: "w-28" },
];

function Row({ programId, fact, canEdit }: { programId: string; fact: Fact | null; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const formId = `f-${fact?.id ?? "new"}`;
  return (
    <tr>
      {COLS.map((c) => (
        <Td key={c.k} className={c.w}>
          {canEdit ? <Input form={formId} name={c.k} defaultValue={(fact?.[c.k] as string) ?? ""} className="h-8 text-xs" placeholder={fact ? "" : c.label} /> : <span className="text-sm">{(fact?.[c.k] as string) ?? "—"}</span>}
        </Td>
      ))}
      {canEdit && (
        <Td className="w-28 whitespace-nowrap">
          <form
            id={formId}
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              start(async () => {
                const r = await saveFactAction(programId, fact?.id ?? null, fd);
                setErr(r.ok ? null : r.error ?? "Lỗi");
                if (r.ok) {
                  setSaved(true);
                  setTimeout(() => setSaved(false), 1500);
                  if (!fact) document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"]`).forEach((i) => (i.value = ""));
                }
              });
            }}
            className="inline"
          >
            <Button type="submit" size="sm" variant={fact ? "ghost" : "primary"} disabled={pending} title={fact ? "Lưu" : "Thêm"}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4 text-green-600" /> : fact ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </Button>
          </form>
          {fact && (
            <Button size="sm" variant="ghost" title="Xóa" disabled={pending} onClick={() => start(async () => { if (confirm(`Xóa số liệu "${fact.label}"?`)) await deleteFactAction(programId, fact.id); })}>
              <Trash2 className="h-4 w-4 text-slate-400" />
            </Button>
          )}
          {err && <div className="text-xs text-red-600">{err}</div>}
        </Td>
      )}
    </tr>
  );
}

export function FactsEditor({ programId, facts, canEdit, canUseAi }: { programId: string; facts: Fact[]; canEdit: boolean; canUseAi: boolean }) {
  const [suggest, setSuggest] = useState<{ items: FactSuggestion[]; picked: Set<number>; note?: string } | null>(null);
  const [check, setCheck] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"suggest" | "check" | "accept" | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="overflow-x-auto pt-4">
          <table className="w-full">
            <thead><tr>{COLS.map((c) => <Th key={c.k}>{c.label}</Th>)}{canEdit && <Th></Th>}</tr></thead>
            <tbody>
              {facts.map((f) => <Row key={f.id} programId={programId} fact={f} canEdit={canEdit} />)}
              {canEdit && <Row key="new" programId={programId} fact={null} canEdit />}
            </tbody>
          </table>
          {!facts.length && <p className="mt-2 text-sm text-slate-500">Chưa có số liệu. Nhập dòng đầu tiên hoặc để AI đề xuất từ minh chứng đã duyệt.</p>}
        </CardContent>
      </Card>

      {canEdit && canUseAi && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={() => { setBusy("suggest"); start(async () => { const r = await suggestFactsAction(programId); setSuggest({ items: r.items, picked: new Set(r.items.map((_, i) => i)), note: r.error ?? (r.items.length ? undefined : r.usedFallback ? "AI chưa sẵn sàng hoặc chưa có minh chứng đã duyệt có số liệu." : "Không tìm thấy số liệu mới.") }); setBusy(null); }); }}>
            {busy === "suggest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} AI đề xuất từ minh chứng
          </Button>
          <Button variant="outline" disabled={pending || !facts.length} onClick={() => { setBusy("check"); start(async () => { setCheck((await checkFactsAction(programId)).text); setBusy(null); }); }}>
            {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} AI đối chiếu số liệu với minh chứng
          </Button>
        </div>
      )}

      {suggest && (
        <Card>
          <CardHeader><CardTitle>AI đề xuất {suggest.items.length} số liệu</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {suggest.note && <p className="text-sm text-amber-700">{suggest.note}</p>}
            {suggest.items.length > 0 && (
              <>
                <table className="w-full text-sm">
                  <tbody>
                    {suggest.items.map((x, i) => (
                      <tr key={i}>
                        <Td className="w-8"><input type="checkbox" checked={suggest.picked.has(i)} onChange={(e) => { const p = new Set(suggest.picked); if (e.target.checked) p.add(i); else p.delete(i); setSuggest({ ...suggest, picked: p }); }} /></Td>
                        <Td className="w-28 text-slate-500">{x.groupName}</Td><Td>{x.label}</Td><Td className="font-medium">{x.value} {x.unit}</Td><Td className="text-slate-500">{x.period}</Td><Td><Badge color="slate">{x.sourceCode || "—"}</Badge></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button disabled={pending || !suggest.picked.size} onClick={() => { setBusy("accept"); start(async () => { await acceptFactsAction(programId, suggest.items.filter((_, i) => suggest.picked.has(i))); setSuggest(null); setBusy(null); }); }}>
                  {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Thêm {suggest.picked.size} số liệu đã chọn
                </Button>
                <p className="text-xs text-slate-500">Kiểm tra lại từng giá trị với minh chứng nguồn trước khi dùng cho báo cáo.</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {check && (
        <Card>
          <CardHeader><CardTitle>Kết quả đối chiếu số liệu</CardTitle></CardHeader>
          <CardContent><Markdown text={check} /></CardContent>
        </Card>
      )}
    </div>
  );
}
