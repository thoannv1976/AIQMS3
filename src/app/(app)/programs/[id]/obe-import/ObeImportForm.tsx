"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Upload, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Th, Td } from "@/components/ui";
import { previewObeImportAction, applyObeImportAction, type ObePreviewResult } from "./actions";

const KIND_LABEL: Record<string, string> = { obe: "Mức đạt PLO/CLO", pi: "Chỉ báo PI (bỏ qua)" };

export function ObeImportForm({ programId, programCode }: { programId: string; programCode: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [skip, setSkip] = useState<string[]>([]);
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<ObePreviewResult | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fd = (skipped: string[] = skip) => {
    const f = new FormData();
    files.forEach((x) => f.append("files", x));
    skipped.forEach((s) => f.append("skip", s));
    if (replace) f.append("replace", "1");
    return f;
  };
  const onPick = (list: FileList | null) => {
    setFiles(list ? Array.from(list) : []);
    setSkip([]);
    setPreview(null);
    setDone(null);
  };
  const toggleSheet = (where: string) => {
    const next = skip.includes(where) ? skip.filter((s) => s !== where) : [...skip, where];
    setSkip(next);
    start(async () => setPreview(await previewObeImportAction(programId, fd(next))));
  };

  const p = preview?.ok ? preview.preview : null;
  const errors = p?.plan.issues.filter((i) => i.level === "error") ?? [];
  const warnings = p?.plan.issues.filter((i) => i.level === "warning") ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept=".xlsx,.csv" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Chọn tệp Excel
            </Button>
            <span className="text-sm text-slate-500">{files.length ? files.map((f) => f.name).join(", ") : "Có thể chọn nhiều tệp cùng lúc"}</span>
          </div>
          <p className="text-xs text-slate-500">
            Mỗi dòng là mức đạt của một PLO (hoặc CLO) trong một kỳ đo hoặc một khóa. Cột nhận được: <b>PLO</b> (hoặc CLO, Mã HP), <b>Kỳ đo</b> / Học kỳ hoặc{" "}
            <b>Khóa</b>, <b>% đạt</b> (hoặc Số SV được đo + Số SV đạt), <b>Ngưỡng</b> (mặc định 70%), <b>Số SV được đo</b>. Dòng tiêu đề phía trên bảng được bỏ qua;
            sheet theo chỉ báo PI được bỏ qua. Dòng trùng PLO + kỳ/khóa với dữ liệu đã có sẽ được cập nhật.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Xóa toàn bộ dữ liệu OBE cũ của {programCode} trước khi nhập
          </label>
          <Button disabled={!files.length || pending} onClick={() => start(async () => setPreview(await previewObeImportAction(programId, fd())))}>
            {pending && !p ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Xem trước
          </Button>
          {preview && !preview.ok && <p className="text-sm text-red-600">{preview.error}</p>}
        </CardContent>
      </Card>

      {p && (
        <Card>
          <CardHeader>
            <CardTitle>Xem trước dữ liệu OBE sẽ nhập vào {programCode}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Dòng hợp lệ" value={p.plan.rows.length} sub={`${p.counts.create} mới${p.counts.update ? ` · ${p.counts.update} cập nhật` : ""}`} />
              <Stat label="Kỳ đo / khóa" value={p.periods.length} sub={p.periods.slice(0, 3).join(", ") + (p.periods.length > 3 ? "…" : "")} />
              <Stat label="Dưới ngưỡng" value={p.below.length} sub="dòng" />
              <Stat label="Dữ liệu OBE hiện có" value={p.existing} sub={replace ? "sẽ bị xóa trước khi nhập" : "giữ nguyên"} />
            </div>

            <div className="text-xs text-slate-600">
              <div className="mb-1 font-medium text-slate-700">Sheet nhận được (bỏ chọn sheet không muốn nhập):</div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {p.plan.sheets.map((s) => (
                  <li key={s.where}>
                    <label className={`inline-flex items-center gap-1.5 ${s.skipped ? "text-slate-400 line-through" : ""}`}>
                      <input type="checkbox" checked={!s.skipped} disabled={pending || s.kind === "pi"} onChange={() => toggleSheet(s.where)} />
                      {s.where} ({KIND_LABEL[s.kind]}, {s.rows} dòng)
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            {(errors.length > 0 || warnings.length > 0) && (
              <ul className="max-h-48 space-y-1 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                {errors.map((i, k) => (
                  <li key={"e" + k} className="flex gap-1 text-red-700"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.where}: {i.message}</li>
                ))}
                {warnings.map((i, k) => (
                  <li key={"w" + k} className="flex gap-1 text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.where}: {i.message}</li>
                ))}
              </ul>
            )}

            {p.below.length > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Dưới ngưỡng: {p.below.slice(0, 12).join("; ")}{p.below.length > 12 ? "…" : ""}
              </p>
            )}

            {p.plan.rows.length > 0 && (
              <details open>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Dữ liệu ({p.plan.rows.length} dòng)</summary>
                <div className="mt-2 max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead><tr><Th>PLO/CLO</Th><Th>Học phần</Th><Th>Kỳ đo</Th><Th>Khóa</Th><Th>% đạt</Th><Th>Ngưỡng</Th><Th>Cỡ mẫu</Th></tr></thead>
                    <tbody>
                      {p.plan.rows.map((r, i) => (
                        <tr key={i}>
                          <Td className="font-medium">{r.ploCode ?? r.cloCode}</Td>
                          <Td>{r.courseCode ?? "—"}</Td>
                          <Td>{r.semester ?? "—"}</Td>
                          <Td>{r.cohort ?? "—"}</Td>
                          <Td className={r.achievedRate < r.threshold ? "font-semibold text-red-600" : ""}>{r.achievedRate}%</Td>
                          <Td>{r.threshold}%</Td>
                          <Td>{r.sampleSize ?? "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
              <Button
                disabled={pending || p.plan.rows.length === 0}
                onClick={() =>
                  start(async () => {
                    const r = await applyObeImportAction(programId, fd());
                    if (r.ok) {
                      setDone(`Đã nhập: ${r.result.created} dòng mới, ${r.result.updated} dòng cập nhật${r.result.removed ? `, đã xóa ${r.result.removed} dòng cũ` : ""}.`);
                      setPreview(null);
                      setSkip([]);
                    } else setDone("Lỗi: " + r.error);
                  })
                }
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Xác nhận nhập
              </Button>
              {errors.length > 0 && <Badge color="amber">Các dòng lỗi sẽ được bỏ qua</Badge>}
            </div>
          </CardContent>
        </Card>
      )}

      {done && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-5 text-sm">
            <CheckCircle2 className="h-5 w-5 text-green-600" /> {done}
            <Link className="text-brand-700 hover:underline" href={`/obe?program=${programId}`}>Mở Đạt chuẩn đầu ra (OBE) →</Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-800">{value}</div>
      {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
