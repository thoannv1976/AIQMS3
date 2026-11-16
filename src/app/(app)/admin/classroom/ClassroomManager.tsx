"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Loader2, Plus, RotateCcw, Trash2, UserPlus, Copy } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Badge, Th, Td } from "@/components/ui";
import { createSandboxesAction, resetSandboxAction, deleteSandboxAction, addSandboxMembersAction, duplicateProgramAction, type ActionResult } from "./actions";

interface ProgramLite { id: string; code: string; nameVi: string }
interface Sandbox { id: string; code: string; label: string | null; templateCode: string | null; members: number; evidence: number; sectionsDone: number; sections: number; createdAt: string }
interface UserLite { id: string; fullName: string; email: string; role: string }

function Options({ prefix = "" }: { prefix?: string }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
      <label className="flex items-center gap-1.5"><input type="checkbox" name="evidence" defaultChecked id={prefix + "ev"} /> Sao chép minh chứng</label>
      <label className="flex items-center gap-1.5">
        Trạng thái minh chứng:
        <select name="evidenceStatus" defaultValue="uploaded" className="rounded border border-slate-300 px-1 py-0.5 text-xs">
          <option value="uploaded">Đưa về &quot;Đã tải lên&quot; (để học viên luyện duyệt)</option>
          <option value="keep">Giữ như chương trình mẫu</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5"><input type="checkbox" name="sarText" /> Sao chép nội dung SAR</label>
      <label className="flex items-center gap-1.5"><input type="checkbox" name="extras" defaultChecked /> Số liệu chính & khảo sát (câu hỏi)</label>
    </div>
  );
}

export function ClassroomManager({ templates, sandboxes, users }: { templates: ProgramLite[]; sandboxes: Sandbox[]; users: UserLite[] }) {
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const shown = useMemo(() => users.filter((u) => !filter || `${u.fullName} ${u.email}`.toLowerCase().includes(filter.toLowerCase())), [users, filter]);
  const run = (key: string, fn: () => Promise<ActionResult>) => {
    setBusy(key);
    start(async () => {
      setMsg(await fn());
      setBusy(null);
    });
  };

  return (
    <div className="space-y-5">
      {msg && <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.message}</div>}

      <Card>
        <CardHeader><CardTitle>Lớp thực hành đang có ({sandboxes.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {sandboxes.length === 0 ? <p className="text-sm text-slate-500">Chưa có. Tạo ở khung bên dưới.</p> : (
            <table className="w-full text-sm">
              <thead><tr><Th>Mã</Th><Th>Lớp / nhóm</Th><Th>Mẫu</Th><Th>Thành viên</Th><Th>Minh chứng</Th><Th>SAR</Th><Th></Th></tr></thead>
              <tbody>
                {sandboxes.map((s) => (
                  <tr key={s.id}>
                    <Td><Link href={`/programs/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.code}</Link></Td>
                    <Td>{s.label ?? "—"}</Td>
                    <Td>{s.templateCode ?? "—"}</Td>
                    <Td>{s.members}</Td>
                    <Td>{s.evidence}</Td>
                    <Td>{s.sectionsDone}/{s.sections}</Td>
                    <Td className="whitespace-nowrap">
                      <form className="inline" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (confirm(`Đặt lại ${s.code}? Mọi thay đổi của học viên trong chương trình này sẽ mất (thành viên được giữ).`)) run("r" + s.id, () => resetSandboxAction(s.id, fd)); }}>
                        <input type="hidden" name="evidence" value="on" />
                        <input type="hidden" name="extras" value="on" />
                        <Button size="sm" variant="ghost" type="submit" disabled={pending} title="Đặt lại về dữ liệu mẫu">{busy === "r" + s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Đặt lại</Button>
                      </form>
                      <Button size="sm" variant="ghost" disabled={pending || !picked.size} title="Thêm người dùng đang chọn ở khung dưới" onClick={() => run("m" + s.id, () => addSandboxMembersAction(s.id, [...picked]))}><UserPlus className="h-4 w-4" /> +{picked.size}</Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Xóa hẳn ${s.code}? Không khôi phục được.`)) run("d" + s.id, () => deleteSandboxAction(s.id)); }}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tạo lớp thực hành</CardTitle></CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              picked.forEach((id) => fd.append("userIds", id));
              run("create", () => createSandboxesAction(fd));
            }}
          >
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label>Chương trình mẫu</Label>
                <Select name="templateId" required defaultValue="">
                  <option value="" disabled>— Chọn —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.nameVi}</option>)}
                </Select>
              </div>
              <div><Label>Tên lớp</Label><Input name="label" placeholder="VD: Lớp K22 – 18/11" /></div>
              <div><Label>Số nhóm (1–20)</Label><Input name="groups" type="number" min={1} max={20} defaultValue={1} /></div>
              <div><Label>Tiền tố mã (tùy chọn)</Label><Input name="prefix" placeholder="VD: K22-SBI" /></div>
            </div>
            <Options />
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-700">Học viên ({picked.size} đã chọn – chia đều vào các nhóm)</span>
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Lọc theo tên/email" className="h-8 w-64 text-xs" />
                <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set(shown.map((u) => u.id)))}>Chọn tất cả đang lọc</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Bỏ chọn</Button>
              </div>
              <div className="grid max-h-56 gap-1 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={picked.has(u.id)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(u.id); else n.delete(u.id); setPicked(n); }} />
                    <span className="truncate">{u.fullName} <span className="text-slate-400">({u.email})</span></span>
                    <Badge color="slate">{u.role}</Badge>
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={pending}>{busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Tạo lớp thực hành</Button>
            <p className="text-xs text-slate-500">Việc sao chép chương trình lớn (≈150 minh chứng) mất khoảng 10–30 giây mỗi nhóm. Tệp minh chứng dùng chung với chương trình mẫu (không tốn thêm dung lượng); xóa lớp thực hành không xóa tệp gốc.</p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5"><Copy className="h-4 w-4" /> Nhân bản chương trình (bản chính thức)</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run("dup", () => duplicateProgramAction(fd)); }}>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Từ chương trình</Label>
                <Select name="templateId" required defaultValue="">
                  <option value="" disabled>— Chọn —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.nameVi}</option>)}
                </Select>
              </div>
              <div><Label>Mã mới</Label><Input name="code" required placeholder="VD: AIKD-2027" /></div>
              <div><Label>Tên mới</Label><Input name="nameVi" required /></div>
            </div>
            <Options prefix="d" />
            <Button type="submit" variant="outline" disabled={pending}>{busy === "dup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Nhân bản</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
