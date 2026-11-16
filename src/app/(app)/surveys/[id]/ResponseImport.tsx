"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Select, Th, Td } from "@/components/ui";
import { previewResponseImportAction, applyResponseImportAction, type ResponseImportPreviewResult } from "./import-actions";

export function ResponseImport({ surveyId }: { surveyId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState("");
  const [skipDup, setSkipDup] = useState(true);
  const [preview, setPreview] = useState<ResponseImportPreviewResult | null>(null);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const fd = (sheetName = sheet) => {
    const f = new FormData();
    if (file) f.append("file", file);
    if (sheetName) f.append("sheet", sheetName);
    if (skipDup) f.append("skipDup", "1");
    return f;
  };
  const runPreview = (sheetName: string) =>
    start(async () => {
      const r = await previewResponseImportAction(surveyId, fd(sheetName));
      setPreview(r);
      if (r.ok) setSheet(r.preview.sheet);
    });
  const onPick = (list: FileList | null) => {
    setFile(list?.[0] ?? null);
    setSheet("");
    setPreview(null);
    setDone(null);
  };

  const p = preview?.ok ? preview.preview : null;
  const toImport = p ? p.importable - (skipDup ? p.duplicates : 0) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nhập phản hồi từ Excel/CSV</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => onPick(e.target.files)} />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Chọn tệp
          </Button>
          <span className="text-slate-500">{file ? file.name : "Tệp .xlsx hoặc .csv, ví dụ tệp xuất từ Google Forms"}</span>
          <Button size="sm" disabled={!file || pending} onClick={() => runPreview(sheet)}>
            {pending && !p ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Xem trước
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Mỗi dòng là một phản hồi. Cột được ghép với câu hỏi theo nội dung câu hỏi (tiêu đề cột của Google Forms) hoặc theo dạng “Q1”, “Câu 1”.
          Thang 1–5 nhận số hoặc nhãn (“Rất không đồng ý” … “Rất đồng ý”); câu nhiều lựa chọn tách bằng dấu ; hoặc dấu phẩy. Cột không khớp (dấu thời gian, người điền…) được bỏ qua.
        </p>
        {preview && !preview.ok && <p className="text-red-600">{preview.error}</p>}

        {p && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-end gap-3">
              {p.sheets.length > 1 && (
                <label className="text-xs text-slate-500">
                  Sheet
                  <Select
                    value={p.sheet}
                    disabled={pending}
                    onChange={(e) => runPreview(e.target.value)}
                    className="h-8 w-auto min-w-56 text-xs"
                  >
                    {p.sheets.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name} ({s.rows} dòng, {s.matched} cột khớp)
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge color="blue">{p.rowCount} dòng dữ liệu</Badge>
                <Badge color="green">{p.importable} dòng hợp lệ</Badge>
                {p.duplicates > 0 && <Badge color="amber">{p.duplicates} dòng trùng phản hồi đã nhập</Badge>}
                {p.rowCount - p.importable > 0 && <Badge color="red">{p.rowCount - p.importable} dòng bị bỏ qua</Badge>}
              </div>
            </div>

            <div>
              <div className="mb-1 font-medium text-slate-700">Ghép cột → câu hỏi</div>
              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Cột trong tệp</Th>
                      <Th>Câu hỏi</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.columns.map((c, i) => (
                      <tr key={i}>
                        <Td className="max-w-72 truncate" title={c.header}>{c.header}</Td>
                        <Td>
                          {c.question ? (
                            <span>
                              {c.question} <span className="text-xs text-slate-400">({c.via === "text" ? "theo nội dung" : "theo số thứ tự"})</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">— bỏ qua</span>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.missing.length > 0 && (
                <p className="mt-1 text-xs text-amber-700">Câu hỏi không có cột tương ứng (sẽ để trống): {p.missing.join(" · ")}</p>
              )}
            </div>

            {p.issues.length > 0 && (
              <div>
                <div className="mb-1 font-medium text-slate-700">Lỗi / cảnh báo theo dòng ({p.issuesTotal})</div>
                <ul className="max-h-48 space-y-1 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                  {p.issues.map((i, k) => (
                    <li key={k} className={`flex gap-1 ${i.level === "error" ? "text-red-700" : "text-amber-700"}`}>
                      {i.level === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      Dòng {i.row}: {i.message}
                    </li>
                  ))}
                  {p.issuesTotal > p.issues.length && <li className="text-slate-500">… và {p.issuesTotal - p.issues.length} mục khác</li>}
                </ul>
              </div>
            )}

            {p.sample.length > 0 && (
              <div>
                <div className="mb-1 font-medium text-slate-700">Mẫu {p.sample.length} dòng sau khi đọc</div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="text-xs">
                    <thead>
                      <tr>
                        <Th>Dòng</Th>
                        {p.sampleHeaders.map((h) => (
                          <Th key={h}>{h}</Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.sample.map((r) => (
                        <tr key={r.row}>
                          <Td>{r.row}</Td>
                          {r.values.map((v, k) => (
                            <Td key={k} className="max-w-48 truncate" title={v}>
                              {v || <span className="text-slate-300">—</span>}
                            </Td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3">
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} className="accent-brand-600" />
                Bỏ qua dòng trùng
                <span className="text-xs text-slate-400">(giống hệt một phản hồi đã nhập từ tệp trước đó)</span>
              </label>
              <Button
                disabled={pending || toImport <= 0}
                onClick={() =>
                  start(async () => {
                    const r = await applyResponseImportAction(surveyId, fd());
                    if (r.ok) {
                      const extra = [r.skippedDuplicates ? `${r.skippedDuplicates} dòng trùng bỏ qua` : "", r.skippedInvalid ? `${r.skippedInvalid} dòng không hợp lệ bỏ qua` : ""].filter(Boolean).join(", ");
                      setDone({ ok: true, text: `Đã nhập ${r.created} phản hồi${extra ? ` (${extra})` : ""}.` });
                      setPreview(null);
                      setFile(null);
                      setSheet("");
                      if (inputRef.current) inputRef.current.value = "";
                    } else setDone({ ok: false, text: "Lỗi: " + r.error });
                  })
                }
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Xác nhận nhập {toImport > 0 ? `${toImport} phản hồi` : ""}
              </Button>
            </div>
          </div>
        )}

        {done && (
          <p className={`flex items-center gap-2 ${done.ok ? "text-green-700" : "text-red-600"}`}>
            {done.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {done.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
