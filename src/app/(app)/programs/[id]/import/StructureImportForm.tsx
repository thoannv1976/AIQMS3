"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Upload, CheckCircle2, AlertTriangle, XCircle, Loader2, Download } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Th, Td } from "@/components/ui";
import { previewStructureImportAction, applyStructureImportAction, type PreviewResult } from "./actions";

const KIND_LABEL: Record<string, string> = { course: "Học phần", plo: "PLO", matrix: "Ma trận I/R/M", clo: "CLO", pi: "PI (bỏ qua)" };
const LEVEL: Record<string, string> = { INTRODUCED: "I", REINFORCED: "R", MASTERED: "M" };

export function StructureImportForm({ programId, programCode }: { programId: string; programCode: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [skip, setSkip] = useState<string[]>([]);
  const [applyInfo, setApplyInfo] = useState(true);
  const [pending, start] = useTransition();

  const fd = (skipped: string[] = skip) => {
    const f = new FormData();
    files.forEach((x) => f.append("files", x));
    skipped.forEach((s) => f.append("skip", s));
    if (applyInfo) f.append("applyInfo", "1");
    return f;
  };
  const onPick = (list: FileList | null) => {
    setFiles(list ? Array.from(list) : []);
    setSkip([]);
    setPreview(null);
    setDone(null);
  };
  // Unticking a sheet re-runs the preview without it, so counts and warnings stay accurate.
  const toggleSheet = (where: string) => {
    const next = skip.includes(where) ? skip.filter((s) => s !== where) : [...skip, where];
    setSkip(next);
    start(async () => setPreview(await previewStructureImportAction(programId, fd(next))));
  };

  const p = preview?.ok ? preview.preview : null;
  const errors = p?.plan.issues.filter((i) => i.level === "error") ?? [];
  const warnings = p?.plan.issues.filter((i) => i.level === "warning") ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputRef} type="file" accept=".xlsx,.csv,.docx" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Chọn tệp Excel / Word
            </Button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download route, not a page */}
            <a href="/programs/import-template" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
              <Download className="h-4 w-4" /> Tải tệp mẫu
            </a>
            <span className="text-sm text-slate-500">{files.length ? files.map((f) => f.name).join(", ") : "Có thể chọn nhiều tệp cùng lúc"}</span>
          </div>
          <p className="text-xs text-slate-500">
            Hệ thống tự nhận sheet Học phần, PLO, Ma trận (cột PLO1, PLO2… với giá trị I/R/M) và CLO, kể cả khi có dòng tiêu đề phía trên bảng.
            Với tệp Word (.docx): mỗi bảng được đọc như một sheet; PLO viết dạng đoạn văn &quot;PLO1: …&quot; cũng được nhận; bảng khai báo
            thông tin chương trình (Tên tiếng Anh, Trình độ, Tổng số tín chỉ, Mục tiêu chung, PO1…, Phiên bản) dùng để cập nhật thông tin chung.
            Dữ liệu trùng mã sẽ được cập nhật; ô trống trong ma trận sẽ xóa liên kết cũ của học phần đó.
          </p>
          <Button disabled={!files.length || pending} onClick={() => start(async () => setPreview(await previewStructureImportAction(programId, fd())))}>
            {pending && !p ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Xem trước
          </Button>
          {preview && !preview.ok && <p className="text-sm text-red-600">{preview.error}</p>}
        </CardContent>
      </Card>

      {p && (
        <Card>
          <CardHeader>
            <CardTitle>Xem trước dữ liệu sẽ nhập vào {programCode}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {(
                [
                  ["Học phần", p.counts.courses],
                  ["PLO", p.counts.plos],
                  ["Ô ma trận", p.counts.matrixCells],
                  ["CLO", p.counts.clos],
                ] as const
              ).map(([label, c]) => (
                <div key={label} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-xl font-semibold text-slate-800">{c.create + c.update}</div>
                  <div className="text-xs text-slate-500">
                    {c.create} mới{c.update ? ` · ${c.update} cập nhật` : ""}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-600">
              <div className="mb-1 font-medium text-slate-700">Sheet nhận được (bỏ chọn sheet không muốn nhập):</div>
              {p.plan.sheets.length ? (
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
              ) : (
                "—"
              )}
            </div>

            {p.plan.info && (
              <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-3 text-sm">
                <label className="mb-2 flex items-center gap-2 font-medium text-slate-700">
                  <input type="checkbox" checked={applyInfo} disabled={pending || !p.infoChanges.length} onChange={(e) => setApplyInfo(e.target.checked)} />
                  Cập nhật thông tin chung của chương trình từ {p.plan.info.file}
                </label>
                {p.infoChanges.length ? (
                  <table className="w-full text-xs">
                    <thead><tr><Th>Thông tin</Th><Th>Hiện tại</Th><Th>Trong tệp</Th></tr></thead>
                    <tbody>
                      {p.infoChanges.map((c) => (
                        <tr key={c.field}>
                          <Td className="w-36 font-medium">{c.label}</Td>
                          <Td className="whitespace-pre-line text-slate-500">{c.current || "—"}</Td>
                          <Td className="whitespace-pre-line">{c.next}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-slate-500">Thông tin chung trong tệp trùng với dữ liệu hiện có — không có gì thay đổi.</p>
                )}
              </div>
            )}

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

            {p.plan.courses.length > 0 && (
              <details open>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Học phần ({p.plan.courses.length})</summary>
                <table className="mt-2 w-full text-sm"><thead><tr><Th>Mã</Th><Th>Tên</Th><Th>TC</Th><Th>HK</Th><Th>Loại</Th></tr></thead>
                  <tbody>{p.plan.courses.map((c) => <tr key={c.code}><Td>{c.code}</Td><Td>{c.nameVi}</Td><Td>{c.credits}</Td><Td>{c.semester ?? "—"}</Td><Td>{c.type ?? "—"}</Td></tr>)}</tbody></table>
              </details>
            )}
            {p.plan.plos.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">PLO ({p.plan.plos.length})</summary>
                <table className="mt-2 w-full text-sm"><tbody>{p.plan.plos.map((x) => <tr key={x.code}><Td className="w-20">{x.code}</Td><Td>{x.description}</Td><Td className="w-28">{x.category ?? "—"}</Td></tr>)}</tbody></table>
              </details>
            )}
            {p.plan.matrix.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Ma trận ({p.plan.matrix.length} học phần)</summary>
                <div className="mt-2 overflow-x-auto"><table className="text-sm"><tbody>{p.plan.matrix.map((m) => (
                  <tr key={m.courseCode}><Td className="font-medium">{m.courseCode}</Td>{m.cells.map((c) => <Td key={c.ploCode} className="text-center" title={c.ploCode}>{c.level ? `${c.ploCode}:${LEVEL[c.level]}` : <span className="text-slate-300">{c.ploCode}</span>}</Td>)}</tr>
                ))}</tbody></table></div>
              </details>
            )}
            {p.plan.clos.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">CLO ({p.plan.clos.length})</summary>
                <table className="mt-2 w-full text-sm"><tbody>{p.plan.clos.map((c) => <tr key={c.courseCode + c.code}><Td className="w-24">{c.courseCode}</Td><Td className="w-16">{c.code}</Td><Td>{c.description}</Td><Td className="w-32">{c.plos.join(", ") || "—"}</Td></tr>)}</tbody></table>
              </details>
            )}

            <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
              <Button
                disabled={pending || (p.plan.courses.length + p.plan.plos.length + p.plan.matrix.length + p.plan.clos.length === 0 && !(applyInfo && p.infoChanges.length))}
                onClick={() =>
                  start(async () => {
                    const r = await applyStructureImportAction(programId, fd());
                    if (r.ok) {
                      setDone(
                        `Đã nhập: ${r.result.courses} học phần, ${r.result.plos} PLO, ${r.result.matrixCells} ô ma trận, ${r.result.clos} CLO` +
                          (r.result.infoUpdated ? `; cập nhật ${r.result.infoUpdated} mục thông tin chung.` : "."),
                      );
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
            <Link className="text-brand-700 hover:underline" href={`/outcomes?program=${programId}`}>Mở Chuẩn đầu ra & ma trận →</Link>
            <Link className="text-brand-700 hover:underline" href={`/programs/${programId}`}>Về trang chương trình →</Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
