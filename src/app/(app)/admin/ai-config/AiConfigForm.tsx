"use client";

import { useState, useTransition } from "react";
import { Zap, Save, Trash2, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button, Input, Label, Select, Badge } from "@/components/ui";
import { saveKeyAction, saveLocalAiUrlAction, testConnectionAction, saveRoutingAction, saveBudgetAction, savePricesAction, recalcCostsAction, type ActionMsg } from "./actions";
import type { ConnectionTestResult } from "@/lib/ai/client";

type P = "anthropic" | "openai" | "gemini" | "localai";
export interface ProviderView { id: P; label: string; keyHint: string; last4: string | null; source: "db" | "env" | "none"; ready: boolean; local: boolean; suggested: string[]; consoleUrl: string }
export interface LocalAiView { baseUrl: string | null; source: "db" | "env" | "none"; defaultUrl: string }
export interface RoutingView { mode: string; high: { provider: P; model: string }; economy: { provider: P; model: string }; fallback: P[] }

function Msg({ m }: { m: ActionMsg | null }) {
  if (!m) return null;
  return <span className={`text-xs ${m.ok ? "text-green-700" : "text-red-600"}`}>{m.message}</span>;
}

/** API keys for the cloud providers, the LocalAI address + tier routing (models discovered by "Kiểm tra" feed the pickers). */
export function ProvidersAndRouting({ providers, routing, localai }: { providers: ProviderView[]; routing: RoutingView; localai: LocalAiView }) {
  const [url, setUrl] = useState(localai.baseUrl ?? localai.defaultUrl);
  const [found, setFound] = useState<Record<string, string[]>>({});
  const [tests, setTests] = useState<Record<string, ConnectionTestResult | null>>({});
  const [msgs, setMsgs] = useState<Record<string, ActionMsg | null>>({});
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [routeMsg, setRouteMsg] = useState<ActionMsg | null>(null);
  const [hiP, setHiP] = useState<P>(routing.high.provider);
  const [ecoP, setEcoP] = useState<P>(routing.economy.provider);
  const modelsFor = (p: P) => [...new Set([...(found[p] ?? []), ...(providers.find((x) => x.id === p)?.suggested ?? [])])];
  const run = (k: string, fn: () => Promise<void>) => { setBusy(k); start(async () => { await fn(); setBusy(null); }); };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {providers.map((p) => (
          <div key={p.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">{p.label}</span>
              {p.local
                ? (p.ready ? <Badge color="green">Đã cấu hình ({localai.source === "db" ? "CSDL" : "biến môi trường"})</Badge> : <Badge color="slate">Chưa cấu hình</Badge>)
                : p.source === "none" ? <Badge color="slate">Chưa có key</Badge> : <Badge color="green">••••{p.last4} ({p.source === "db" ? "CSDL" : "biến môi trường"})</Badge>}
            </div>
            {p.local && (
              <div className="space-y-1.5">
                <Label>Địa chỉ máy chủ (chuẩn OpenAI)</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={localai.defaultUrl} className="font-mono text-xs" />
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" disabled={pending || !url.trim()} onClick={() => run("u" + p.id, async () => setMsgs({ ...msgs, [p.id]: await saveLocalAiUrlAction(url) }))}>
                    {busy === "u" + p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu địa chỉ
                  </Button>
                  {localai.source === "db" && (
                    <Button size="sm" variant="ghost" disabled={pending} title="Xóa địa chỉ đã lưu" onClick={() => { if (confirm("Xóa địa chỉ LocalAI đã lưu?")) run("x" + p.id, async () => setMsgs({ ...msgs, [p.id]: await saveLocalAiUrlAction(null) })); }}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
                <p className="text-[11px] leading-tight text-slate-500">Không tốn phí theo token. Chưa hỗ trợ OCR tệp PDF/ảnh. Lần gọi đầu có thể mất ~1–2 phút để nạp mô hình vào GPU.</p>
                <Label>API key (nếu LocalAI có đặt)</Label>
              </div>
            )}
            <Input type="password" autoComplete="off" placeholder={`${p.keyHint} (để trống = giữ key hiện tại)`} value={keys[p.id] ?? ""} onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })} />
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" disabled={pending || !(keys[p.id] ?? "").trim()} onClick={() => run("k" + p.id, async () => { const m = await saveKeyAction(p.id, keys[p.id] ?? ""); setMsgs({ ...msgs, [p.id]: m }); if (m.ok) setKeys({ ...keys, [p.id]: "" }); })}>
                {busy === "k" + p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu key
              </Button>
              <Button size="sm" variant="outline" disabled={pending || !p.ready} onClick={() => run("t" + p.id, async () => { const r = await testConnectionAction(p.id); setTests({ ...tests, [p.id]: r }); if (r.models) setFound({ ...found, [p.id]: r.models }); })}>
                {busy === "t" + p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Kiểm tra
              </Button>
              {p.source === "db" && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Xóa key ${p.label}?`)) run("d" + p.id, async () => setMsgs({ ...msgs, [p.id]: await saveKeyAction(p.id, null) })); }}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
            </div>
            <Msg m={msgs[p.id] ?? null} />
            {tests[p.id] && (
              <div className={`rounded px-2 py-1.5 text-xs ${tests[p.id]!.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
                {tests[p.id]!.message}
                {tests[p.id]!.models && <div className="mt-1 text-slate-600">{tests[p.id]!.models!.length} mô hình khả dụng – đã đưa vào danh sách chọn bên dưới.</div>}
              </div>
            )}
            <a href={p.consoleUrl} target="_blank" rel="noreferrer" className="block text-xs text-brand-700 hover:underline">{p.local ? "Mở trang quản lý LocalAI →" : "Lấy key / xem số dư →"}</a>
          </div>
        ))}
      </div>

      <form className="space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run("route", async () => setRouteMsg(await saveRoutingAction(fd))); }}>
        <div className="font-semibold text-slate-800">Phân tầng mô hình</div>
        {(
          [
            ["high", "Chất lượng cao", "Soạn/rà soát SAR, câu hỏi phỏng vấn, bản tin lãnh đạo, phân tích khảo sát, trợ lý AI…", hiP, setHiP, routing.high.model],
            ["economy", "Tiết kiệm", "Gợi ý tiêu chí, tóm tắt, AI kiểm tra minh chứng, OCR, đề xuất số liệu, nhập đề cương…", ecoP, setEcoP, routing.economy.model],
          ] as const
        ).map(([t, label, hint, prov, setProv, model]) => (
          <div key={t} className="grid items-end gap-2 md:grid-cols-[180px_1fr_1fr]">
            <div><Label>{label}</Label><p className="text-[11px] leading-tight text-slate-500">{hint}</p></div>
            <div>
              <Label>Nhà cung cấp</Label>
              <Select name={`${t}Provider`} value={prov} onChange={(e) => setProv(e.target.value as P)}>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.label}{p.ready ? "" : p.local ? " (chưa cấu hình)" : " (chưa có key)"}</option>)}
              </Select>
            </div>
            <div>
              <Label>Mô hình</Label>
              <Input name={`${t}Model`} list={`models-${t}`} defaultValue={model} key={`${t}-${prov}`} placeholder="Chọn hoặc gõ mã mô hình" />
              <datalist id={`models-${t}`}>{modelsFor(prov).map((m) => <option key={m} value={m} />)}</datalist>
            </div>
          </div>
        ))}
        <div className="grid gap-2 md:grid-cols-4">
          <div>
            <Label>Chế độ</Label>
            <Select name="mode" defaultValue={routing.mode}>
              <option value="auto">Tự động (có key → gọi AI)</option>
              <option value="real">Bắt buộc gọi AI</option>
              <option value="mock">Mô phỏng (luôn dự phòng)</option>
            </Select>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Label>Dự phòng {i + 1}</Label>
              <Select name={`fb${i + 1}`} defaultValue={routing.fallback[i] ?? ""}>
                <option value="">—</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">Khi nhà cung cấp chính lỗi (hết credit, quá tải, sai mô hình), hệ thống tự thử lần lượt các nhà cung cấp dự phòng đã có key (hoặc LocalAI đã cấu hình địa chỉ), trước khi dùng chế độ quy tắc.</p>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{busy === "route" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu phân tầng</Button>
          <Msg m={routeMsg} />
        </div>
      </form>
    </div>
  );
}

export function BudgetForm({ budget, autoEvidenceCheck, rate }: { budget: { monthlyUsd: number | null; dailyUsd: number | null; perUserDailyUsd: number | null; warnPct: number }; autoEvidenceCheck: boolean; rate: number }) {
  const [unit, setUnit] = useState<"usd" | "vnd">("usd");
  const [msg, setMsg] = useState<ActionMsg | null>(null);
  const [pending, start] = useTransition();
  const show = (v: number | null) => (v === null ? "" : unit === "usd" ? String(v) : String(Math.round(v * rate)));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => setMsg(await saveBudgetAction(fd))); }}>
      <input type="hidden" name="unit" value={unit} />
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-600">Đơn vị nhập:</span>
        {(["usd", "vnd"] as const).map((u) => (
          <button type="button" key={u} onClick={() => setUnit(u)} className={`rounded px-2 py-0.5 text-xs ${unit === u ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}`}>{u.toUpperCase()}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4" key={unit}>
        <div><Label>Hạn mức tháng</Label><Input name="monthly" inputMode="decimal" defaultValue={show(budget.monthlyUsd)} placeholder="Không giới hạn" /></div>
        <div><Label>Hạn mức ngày</Label><Input name="daily" inputMode="decimal" defaultValue={show(budget.dailyUsd)} placeholder="Không giới hạn" /></div>
        <div><Label>Mỗi người / ngày</Label><Input name="perUser" inputMode="decimal" defaultValue={show(budget.perUserDailyUsd)} placeholder="Không giới hạn" /></div>
        <div><Label>Cảnh báo ở (%)</Label><Input name="warnPct" inputMode="numeric" defaultValue={String(Math.round(budget.warnPct * 100))} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="autoEvidenceCheck" defaultChecked={autoEvidenceCheck} /> Tự động cho AI kiểm tra minh chứng khi tải lên (mức Tiết kiệm)
      </label>
      <p className="text-xs text-slate-500">Để trống = không giới hạn. Khi chạm hạn mức, mọi tính năng AI tạm dùng chế độ quy tắc và báo rõ lý do; Admin nhận thông báo khi chi tiêu vượt ngưỡng cảnh báo. 1 USD ≈ {new Intl.NumberFormat("vi-VN").format(rate)}đ.</p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu hạn mức</Button>
        <Msg m={msg} />
      </div>
    </form>
  );
}

export function PriceTable({ rows: initial }: { rows: Array<{ model: string; builtin: { input: number; output: number } | null; override: { input: number; output: number } | null; used: boolean }> }) {
  const [rows, setRows] = useState(initial.map((r) => ({ ...r, input: r.override ? String(r.override.input) : "", output: r.override ? String(r.override.output) : "" })));
  const [msg, setMsg] = useState<ActionMsg | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, k: "model" | "input" | "output", v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Mô hình</th><th>Giá có sẵn (vào / ra, $/1M token)</th><th>Giá tùy chỉnh – vào</th><th>ra</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1 pr-2">{initial[i] ? <span className="font-mono text-xs">{r.model}</span> : <Input value={r.model} onChange={(e) => set(i, "model", e.target.value)} className="h-8 text-xs" placeholder="mã mô hình" />}{r.used && <Badge color="blue">đang dùng</Badge>}</td>
                <td className="pr-2 text-xs">{r.builtin ? `$${r.builtin.input} / $${r.builtin.output}` : <span className="text-amber-700">chưa có – ước tính $5 / $25</span>}</td>
                <td className="pr-2"><Input value={r.input} onChange={(e) => set(i, "input", e.target.value)} className="h-8 w-24 text-xs" placeholder="—" /></td>
                <td><Input value={r.output} onChange={(e) => set(i, "output", e.target.value)} className="h-8 w-24 text-xs" placeholder="—" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { model: "", builtin: null, override: null, used: false, input: "", output: "" }])}><Plus className="h-4 w-4" /> Thêm mô hình</Button>
        <Button size="sm" disabled={pending} onClick={() => start(async () => setMsg(await savePricesAction(rows.map((r) => ({ model: r.model, input: r.input, output: r.output })))))}><Save className="h-4 w-4" /> Lưu đơn giá</Button>
        <Button size="sm" variant="outline" disabled={pending} title="Tính lại chi phí mọi lượt gọi đã ghi theo bảng giá hiện tại" onClick={() => { if (confirm("Tính lại chi phí của toàn bộ lịch sử gọi AI theo bảng giá hiện tại?")) start(async () => setMsg(await recalcCostsAction())); }}><RefreshCw className="h-4 w-4" /> Tính lại chi phí lịch sử</Button>
        <Msg m={msg} />
      </div>
      <p className="text-xs text-slate-500">Giá Claude có sẵn theo bảng giá Anthropic (11/2026). Giá OpenAI/Gemini thay đổi thường xuyên – nhập theo trang giá của nhà cung cấp. Để trống ô tùy chỉnh = dùng giá có sẵn.</p>
    </div>
  );
}
