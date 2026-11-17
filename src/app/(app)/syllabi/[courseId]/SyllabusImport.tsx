"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { FileText, Upload, CheckCircle2, AlertTriangle, Loader2, Sparkles, X } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Th, Td, Label, Textarea } from "@/components/ui";
import type { SyllabusField, SyllabusFields } from "@/lib/import/syllabus";
import { previewSyllabusImportAction, applySyllabusImportAction, type SyllabusImportPreview } from "./import-actions";

const MAX_BYTES = 10 * 1024 * 1024;

const FIELDS: Array<[SyllabusField, string]> = [
  ["objectives", "Mục tiêu học phần"],
  ["content", "Nội dung"],
  ["teachingMethods", "Phương pháp dạy học"],
  ["assessmentMethods", "Đánh giá học phần"],
  ["materials", "Tài liệu học tập"],
  ["schedule", "Kế hoạch giảng dạy"],
  ["requirements", "Yêu cầu đối với người học"],
];

const STRENGTH: Record<string, { label: string; color: "slate" | "blue" | "green" }> = {
  LOW: { label: "Thấp", color: "slate" },
  MEDIUM: { label: "Trung bình", color: "blue" },
  HIGH: { label: "Cao", color: "green" },
};

export function SyllabusImport({ courseId, programId }: { courseId: string; programId?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [preview, setPreview] = useState<SyllabusImportPreview | null>(null);
  const [fields, setFields] = useState<SyllabusFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; warnings: string[] } | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setPreview(null);
    setFields(null);
    setError(null);
  };

  const onPick = (list: FileList | null) => {
    const f = list?.[0] ?? null;
    reset();
    setDone(null);
    if (f && f.size > MAX_BYTES) {
      setFile(null);
      setError("Tệp vượt quá 10 MB.");
      return;
    }
    setFile(f);
  };

  const analyse = () =>
    start(async () => {
      if (!file) return;
      reset();
      setDone(null);
      const fd = new FormData();
      fd.append("file", file);
      if (useAi) fd.append("useAi", "1");
      const r = await previewSyllabusImportAction(courseId, fd);
      if (r.ok) {
        setPreview(r.preview);
        setFields(r.preview.fields);
      } else setError(r.error);
    });

  const apply = () =>
    start(async () => {
      if (!preview || !fields) return;
      const r = await applySyllabusImportAction(courseId, {
        fileName: preview.fileName,
        fields,
        clos: preview.clos.map(({ code, description, plos, strength }) => ({ code, description, plos, strength })),
        aiModel: preview.ai?.used ? preview.ai.model : null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const x = r.result;
      const parts = [
        x.syllabus ? `${x.syllabus === "created" ? "tạo" : "cập nhật"} đề cương (${x.fieldsSaved.length} mục)` : null,
        x.closCreated ? `${x.closCreated} CLO mới` : null,
        x.closUpdated ? `${x.closUpdated} CLO cập nhật` : null,
        x.links ? `${x.links} liên kết CLO–PLO` : null,
      ].filter(Boolean);
      setDone({ text: `Đã áp dụng: ${parts.join(", ") || "không có thay đổi"}.`, warnings: x.warnings });
      reset();
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    });

  const filled = fields ? FIELDS.filter(([k]) => fields[k].trim()).length : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-600" /> Nhập từ Word
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => onPick(e.target.files)}
            />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={pending}>
              <Upload className="h-4 w-4" /> Chọn tệp .docx
            </Button>
            <span className="text-sm text-slate-500">{file ? file.name : "Đề cương chi tiết học phần, tối đa 10 MB"}</span>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            <Sparkles className="h-4 w-4 text-purple-600" /> Dùng AI để hoàn thiện kết quả phân tích (nếu đã cấu hình)
          </label>
          <p className="text-xs text-slate-500">
            Hệ thống nhận các mục theo tiêu đề thường gặp: Mục tiêu học phần, Chuẩn đầu ra học phần (CLO), Nội dung, Phương pháp dạy học, Đánh giá,
            Tài liệu, Kế hoạch giảng dạy / Lịch trình, Yêu cầu. Bạn được xem trước và chỉnh sửa trước khi áp dụng.
          </p>
          <Button type="button" onClick={analyse} disabled={!file || pending}>
            {pending && !preview ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Phân tích & xem trước
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {done && (
          <div className="space-y-1 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> {done.text}
              <span className="ml-auto flex gap-3 text-xs font-medium">
                <Link href={`/syllabi/${courseId}`} className="hover:underline">
                  Xem đề cương
                </Link>
                {programId && (
                  <Link href={`/syllabi?program=${programId}`} className="hover:underline">
                    ← Quay lại danh sách đề cương
                  </Link>
                )}
              </span>
            </div>
            {done.warnings.length > 0 && (
              <ul className="space-y-0.5 pl-6 text-xs text-amber-700">
                {done.warnings.map((w, k) => (
                  <li key={k}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {preview && fields && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-slate-800">Xem trước: {preview.fileName}</span>
              <Badge color="blue">{filled}/{FIELDS.length} mục</Badge>
              <Badge color="cyan">{preview.clos.length} CLO</Badge>
              {preview.ai ? (
                preview.ai.used ? (
                  <Badge color="purple">AI: {preview.ai.model}</Badge>
                ) : (
                  <Badge color="amber">AI không khả dụng — dùng phân tích theo quy tắc</Badge>
                )
              ) : (
                <Badge>Phân tích theo quy tắc</Badge>
              )}
              <button type="button" onClick={reset} className="ml-auto text-slate-400 hover:text-slate-700" title="Hủy xem trước">
                <X className="h-4 w-4" />
              </button>
            </div>

            {preview.warnings.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                {preview.warnings.map((w, k) => (
                  <li key={k} className="flex gap-1">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-3">
              {FIELDS.map(([k, label]) => (
                <div key={k}>
                  <Label htmlFor={`imp-${k}`}>
                    {label}
                    {!fields[k].trim() && <span className="ml-2 text-xs font-normal text-amber-600">không tìm thấy — giữ nguyên giá trị hiện có</span>}
                  </Label>
                  <Textarea
                    id={`imp-${k}`}
                    rows={Math.min(10, Math.max(2, fields[k].split("\n").length + 1))}
                    value={fields[k]}
                    onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
                  />
                </div>
              ))}
            </div>

            {preview.clos.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>Mã</Th>
                      <Th>Mô tả</Th>
                      <Th>PLO</Th>
                      <Th>Mức</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.clos.map((c) => (
                      <tr key={c.code} className="border-t border-slate-100 align-top">
                        <Td className="font-medium">{c.code}</Td>
                        <Td>{c.description}</Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {c.plos.length === 0 && <span className="text-xs text-amber-600">—</span>}
                            {c.plos.map((p) =>
                              c.unknownPlos.includes(p) ? (
                                <span key={p} title="Không có trong chương trình" className="text-xs text-red-600 line-through">
                                  {p}
                                </span>
                              ) : (
                                <Badge key={p} color="cyan">
                                  {p}
                                </Badge>
                              ),
                            )}
                          </div>
                        </Td>
                        <Td>
                          <Badge color={STRENGTH[c.strength].color}>{STRENGTH[c.strength].label}</Badge>
                        </Td>
                        <Td>
                          <Badge color={c.status === "create" ? "green" : "amber"}>{c.status === "create" ? "Mới" : "Cập nhật"}</Badge>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
              <Button type="button" onClick={apply} disabled={pending || (filled === 0 && (!preview.canWriteClos || preview.clos.length === 0))}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Áp dụng
              </Button>
              <span className="text-xs text-slate-500">
                {preview.hasSyllabus ? "Ghi đè các mục có nội dung vào đề cương hiện tại" : "Tạo đề cương mới (bản nháp)"}
                {preview.canWriteClos && preview.clos.length > 0 ? "; CLO trùng mã sẽ được cập nhật, liên kết PLO hiện có được giữ lại." : "."}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
