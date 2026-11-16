"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, Download, Loader2, CheckCircle2, XCircle, AlertTriangle, KeyRound } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Th, Td, Label, Select, Input } from "@/components/ui";
import { previewUserImportAction, applyUserImportAction } from "./actions";
import type { UserPlan } from "@/lib/import/users";

const ROLE_VI: Record<string, string> = {
  ADMIN: "Quản trị hệ thống", BOARD: "Ban Giám hiệu", QA_OFFICE: "Phòng KT&ĐBCL", TRAINING_OFFICE: "Phòng Đào tạo", FACULTY: "Khoa / Viện",
  DEPARTMENT: "Bộ môn", LECTURER: "Giảng viên", HR_OFFICE: "Phòng TCNS", LIBRARY: "Thư viện", IT_CENTER: "Trung tâm CNTT",
  STUDENT_AFFAIRS: "Phòng CTSV", EXTERNAL_REVIEWER: "Đánh giá viên ngoài",
};

type Cred = { fullName: string; email: string; password: string; role: string };

function downloadCsv(rows: Cred[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = "﻿" + ["Họ và tên,Email,Vai trò,Mật khẩu tạm", ...rows.map((r) => [r.fullName, r.email, r.role, r.password].map(esc).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `Mat_khau_tam_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function UserImportForm({ programs }: { programs: Array<{ id: string; code: string; nameVi: string }> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [programId, setProgramId] = useState("");
  const [expires, setExpires] = useState("");
  const [plan, setPlan] = useState<UserPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; assigned: number; credentials: Cred[] } | null>(null);
  const [pending, start] = useTransition();

  const fd = () => {
    const f = new FormData();
    files.forEach((x) => f.append("files", x));
    f.set("defaultProgramId", programId);
    if (expires) f.set("defaultExpires", expires.split("-").reverse().join("/"));
    return f;
  };
  const reset = () => { setPlan(null); setResult(null); setError(null); };
  const errors = plan?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = plan?.issues.filter((i) => i.level === "warning") ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept=".xlsx,.csv" multiple className="hidden" onChange={(e) => { setFiles(e.target.files ? Array.from(e.target.files) : []); reset(); }} />
            <Button variant="outline" onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" /> Chọn tệp Excel</Button>
            <a href="/admin/users/import-template" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><Download className="h-4 w-4" /> Tải tệp mẫu</a>
            <span className="text-sm text-slate-500">{files.map((f) => f.name).join(", ")}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Gán vào chương trình (khi tệp không có cột Chương trình)</Label>
              <Select value={programId} onChange={(e) => { setProgramId(e.target.value); reset(); }}>
                <option value="">— Không gán —</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.nameVi}</option>)}
              </Select>
            </div>
            <div>
              <Label>Hạn dùng mặc định cho đánh giá viên ngoài</Label>
              <Input type="date" value={expires} onChange={(e) => { setExpires(e.target.value); reset(); }} />
            </div>
          </div>
          <p className="text-xs text-slate-500">Vai trò toàn trường (Ban Giám hiệu, Phòng KT&ĐBCL, Phòng Đào tạo, Quản trị) không cần gán chương trình. Email đã có sẽ được cập nhật thông tin, không đổi mật khẩu.</p>
          <Button disabled={!files.length || pending} onClick={() => start(async () => {
            const r = await previewUserImportAction(fd());
            if (r.ok) { setPlan(r.plan); setError(null); } else setError(r.error);
          })}>
            {pending && !plan ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Xem trước
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader><CardTitle>Xem trước: {plan.rows.filter((r) => !r.exists).length} tài khoản mới · {plan.rows.filter((r) => r.exists).length} cập nhật</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(errors.length > 0 || warnings.length > 0) && (
              <ul className="max-h-40 space-y-1 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                {errors.map((i, k) => <li key={"e" + k} className="flex gap-1 text-red-700"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.where}: {i.message}</li>)}
                {warnings.map((i, k) => <li key={"w" + k} className="flex gap-1 text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.where}: {i.message}</li>)}
              </ul>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><Th>Họ tên</Th><Th>Email</Th><Th>Vai trò</Th><Th>Bộ môn</Th><Th>Chương trình</Th><Th>Hết hạn</Th><Th></Th></tr></thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.email}>
                      <Td>{r.fullName}</Td><Td>{r.email}</Td><Td>{ROLE_VI[r.role] ?? r.role}</Td><Td>{r.departmentName ?? "—"}</Td>
                      <Td>{r.programs.map((p) => p.code).join(", ") || "—"}</Td>
                      <Td>{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString("vi-VN") : "—"}</Td>
                      <Td>{r.exists ? <Badge color="blue">Cập nhật</Badge> : <Badge color="green">Mới</Badge>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button disabled={pending || !plan.rows.length} onClick={() => start(async () => {
              const r = await applyUserImportAction(fd());
              if (r.ok) { setResult(r.result); setPlan(null); } else setError(r.error);
            })}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Xác nhận nhập {plan.rows.length} tài khoản
            </Button>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader><CardTitle>Đã nhập: {result.created} mới · {result.updated} cập nhật · {result.assigned} phân công chương trình</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {result.credentials.length > 0 ? (
              <>
                <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <KeyRound className="h-4 w-4" /> Mật khẩu tạm chỉ hiển thị một lần. Tải về và gửi riêng cho từng người; nhắc họ đổi mật khẩu ở trang Tài khoản.
                </p>
                <Button onClick={() => downloadCsv(result.credentials)}><Download className="h-4 w-4" /> Tải danh sách mật khẩu (.csv)</Button>
                <table className="w-full text-sm"><tbody>{result.credentials.map((c) => <tr key={c.email}><Td>{c.fullName}</Td><Td>{c.email}</Td><Td className="font-mono">{c.password}</Td></tr>)}</tbody></table>
              </>
            ) : <p className="text-sm text-slate-600">Không có tài khoản mới nên không có mật khẩu tạm.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
