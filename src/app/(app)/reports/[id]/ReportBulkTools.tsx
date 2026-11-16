"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, Wand2, Square, Loader2, CheckCircle2, ChevronDown } from "lucide-react";
import { Button, Card, CardContent, Badge, Select, Label, Th, Td } from "@/components/ui";
import { Progress } from "@/components/widgets";
import { bulkAssignSectionsAction, draftAndSaveSectionAction, type BatchDraftOutcome } from "../actions";
import { estimateAiCostAction, type CostEstimate } from "../../ai/actions";

function confirmText(kind: string, n: number, e: CostEstimate): string {
  if (e.aiOff) return `AI đang tắt hoặc chưa có khóa API – ${kind} sẽ dùng chế độ quy tắc. Tiếp tục?`;
  const room = [e.remainingMonth != null ? `tháng còn $${e.remainingMonth.toFixed(2)}` : "", e.remainingDay != null ? `hôm nay còn $${e.remainingDay.toFixed(2)}` : ""].filter(Boolean).join(", ");
  return `${kind}: ${n} mục × ≈$${e.perItem.toFixed(3)} ≈ $${e.total.toFixed(2)} (${e.provider} · ${e.model}).` +
    (room ? `\nHạn mức: ${room}.` : "") +
    (e.exceeds ? "\n⚠ Dự kiến vượt hạn mức – quá trình sẽ tự dừng khi chạm hạn mức." : "") +
    "\n\nTiếp tục?";
}


interface Group {
  standardId: string;
  code: string;
  title: string;
  sections: Array<{ id: string; title: string; hasText: boolean; assignedToId: string | null; reviewerId: string | null }>;
}
type Status = "NOT_STARTED" | "DRAFTING" | "REVIEW" | "DONE";

export function ReportBulkTools({ reportId, groups, users, canUseAi }: { reportId: string; groups: Group[]; users: Array<{ id: string; fullName: string }>; canUseAi: boolean }) {
  const [tab, setTab] = useState<"assign" | "draft" | null>(null);
  return (
    <Card className="mb-6">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Công cụ hàng loạt:</span>
          <Button size="sm" variant={tab === "assign" ? "primary" : "outline"} onClick={() => setTab(tab === "assign" ? null : "assign")}>
            <Users className="h-4 w-4" /> Phân công theo tiêu chuẩn
          </Button>
          {canUseAi && (
            <Button size="sm" variant={tab === "draft" ? "primary" : "outline"} onClick={() => setTab(tab === "draft" ? null : "draft")}>
              <Wand2 className="h-4 w-4" /> AI soạn cả báo cáo
            </Button>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 ${tab ? "rotate-180" : ""}`} />
        </div>
        {tab === "assign" && <AssignPanel reportId={reportId} groups={groups} users={users} />}
        {tab === "draft" && <DraftPanel groups={groups} />}
      </CardContent>
    </Card>
  );
}

function AssignPanel({ reportId, groups, users }: { reportId: string; groups: Group[]; users: Array<{ id: string; fullName: string }> }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => Object.fromEntries(groups.map((g) => [g.standardId, { assignedToId: "", reviewerId: "" }])));
  const [overwrite, setOverwrite] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (sid: string, k: "assignedToId" | "reviewerId", v: string) => setRows((r) => ({ ...r, [sid]: { ...r[sid], [k]: v } }));
  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr><Th>Tiêu chuẩn</Th><Th>Số mục</Th><Th>Người viết</Th><Th>Người phản biện</Th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.standardId}>
                <Td className="max-w-md"><span className="font-medium">TC{g.code}</span> <span className="text-slate-500">{g.title}</span></Td>
                <Td>{g.sections.length} <span className="text-xs text-slate-400">({g.sections.filter((s) => s.assignedToId).length} đã có người viết)</span></Td>
                {(["assignedToId", "reviewerId"] as const).map((k) => (
                  <Td key={k}>
                    <Select className="h-8 w-52 text-xs" value={rows[g.standardId][k]} onChange={(e) => set(g.standardId, k, e.target.value)}>
                      <option value="">— Giữ nguyên —</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                    </Select>
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Ghi đè mục đã có người được phân công</label>
        <Button size="sm" disabled={pending} onClick={() => start(async () => {
          const payload = Object.entries(rows).map(([standardId, r]) => ({ standardId, assignedToId: r.assignedToId || null, reviewerId: r.reviewerId || null }));
          const res = await bulkAssignSectionsAction(reportId, payload, overwrite);
          setMsg(res.ok ? `Đã cập nhật ${res.updated} mục và gửi thông báo cho người được phân công.` : res.error ?? "Lỗi");
          router.refresh();
        })}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Áp dụng phân công
        </Button>
        {msg && <span className="text-sm text-green-700">{msg}</span>}
      </div>
    </div>
  );
}

interface LogRow { id: string; title: string; out?: BatchDraftOutcome | { status: "running" } }

function DraftPanel({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [scope, setScope] = useState("all");
  const [overwrite, setOverwrite] = useState(false);
  const [status, setStatus] = useState<Status>("REVIEW");
  const [log, setLog] = useState<LogRow[]>([]);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const targets = groups.filter((g) => scope === "all" || g.standardId === scope).flatMap((g) => g.sections);
  const willRun = targets.filter((s) => overwrite || !s.hasText).length;
  const finished = log.filter((r) => r.out && r.out.status !== "running").length;
  const done = log.filter((r) => r.out?.status === "done") as Array<LogRow & { out: Extract<BatchDraftOutcome, { status: "done" }> }>;

  async function run() {
    const est = await estimateAiCostAction("sar_draft", willRun);
    if (!confirm(confirmText("AI soạn báo cáo", willRun, est))) return;
    stop.current = false;
    setRunning(true);
    const queue = targets.map((s) => ({ id: s.id, title: s.title }));
    setLog(queue.map((q) => ({ ...q })));
    const update = (id: string, out: LogRow["out"]) => setLog((l) => l.map((r) => (r.id === id ? { ...r, out } : r)));
    let i = 0;
    const worker = async () => {
      while (!stop.current && i < queue.length) {
        const item = queue[i++];
        update(item.id, { status: "running" });
        let out: BatchDraftOutcome;
        try {
          out = await draftAndSaveSectionAction(item.id, { overwrite, status });
        } catch {
          out = { status: "error", reason: "Mất kết nối – có thể chạy lại" };
        }
        update(item.id, out);
        if (out.status === "error" && out.stop) stop.current = true; // spending limit reached
      }
    };
    await Promise.all([worker(), worker()]); // 2 sections at a time
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Phạm vi</Label>
          <Select className="h-8 w-72 text-xs" value={scope} disabled={running} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Toàn bộ báo cáo ({groups.reduce((a, g) => a + g.sections.length, 0)} mục)</option>
            {groups.map((g) => <option key={g.standardId} value={g.standardId}>Tiêu chuẩn {g.code} ({g.sections.length} mục)</option>)}
          </Select>
        </div>
        <div>
          <Label>Trạng thái sau khi soạn</Label>
          <Select className="h-8 w-40 text-xs" value={status} disabled={running} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="DRAFTING">Đang soạn</option>
            <option value="REVIEW">Rà soát</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-1 text-sm text-slate-600"><input type="checkbox" checked={overwrite} disabled={running} onChange={(e) => setOverwrite(e.target.checked)} /> Soạn lại cả mục đã có nội dung</label>
        {!running ? (
          <Button size="sm" disabled={!willRun} onClick={run}><Wand2 className="h-4 w-4" /> Bắt đầu ({willRun} mục)</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => (stop.current = true)}><Square className="h-4 w-4" /> Dừng sau mục đang chạy</Button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        AI đọc trích đoạn toàn văn các minh chứng đã duyệt và bảng Số liệu chính của chương trình, soạn 5 phần, lưu thẳng vào mục (có lịch sử để khôi phục).
        Giữ trang này mở trong lúc chạy (khoảng 1–2 phút mỗi mục, chạy song song 2 mục). Mục đã có nội dung sẽ được bỏ qua trừ khi chọn soạn lại.
      </p>
      {log.length > 0 && (
        <>
          <Progress value={Math.round((finished / log.length) * 100)} />
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge color="green">Xong {done.length}</Badge>
            <Badge color="slate">Bỏ qua {log.filter((r) => r.out?.status === "skipped").length}</Badge>
            <Badge color="red">Lỗi {log.filter((r) => r.out?.status === "error").length}</Badge>
            <Badge color="blue">Trích dẫn {done.reduce((a, r) => a + r.out.citations, 0)}</Badge>
            <Badge color="amber">&ldquo;cần bổ sung số liệu&rdquo; {done.reduce((a, r) => a + r.out.needData, 0)}</Badge>
            {running && <span className="flex items-center gap-1 text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> đang chạy…</span>}
          </div>
          <div className="max-h-64 overflow-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <tbody>
                {log.map((r) => (
                  <tr key={r.id}>
                    <Td className="max-w-lg truncate">{r.title}</Td>
                    <Td className="w-64">
                      {!r.out ? <span className="text-slate-400">chờ</span>
                        : r.out.status === "running" ? <span className="text-brand-700">đang soạn…</span>
                        : r.out.status === "done" ? <span className="text-green-700">✓ {r.out.citations} trích dẫn{r.out.needData ? ` · ${r.out.needData} chỗ cần số liệu` : ""}</span>
                        : r.out.status === "skipped" ? <span className="text-slate-500">bỏ qua – {r.out.reason}</span>
                        : <span className="text-red-600">lỗi – {r.out.reason}</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
