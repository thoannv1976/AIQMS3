"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertTriangle, XCircle, Sparkles, Trash2 } from "lucide-react";
import { Button, Card, CardContent, Badge, Select, Th, Td } from "@/components/ui";
import type { BadgeColor } from "@/components/ui";
import { previewSyllabusImportAction, applySyllabusImportAction, type SyllabusImportPreview } from "../[courseId]/import-actions";
import { findSyllabusCourseAction } from "./actions";
import { matchCourseByFileName } from "@/lib/import/syllabus-match";
import type { SyllabusField } from "@/lib/import/syllabus";

const SYLLABUS_FIELDS: SyllabusField[] = ["objectives", "content", "teachingMethods", "assessmentMethods", "materials", "schedule", "requirements"];
const MAX_FILES = 30;
const MAX_BYTES = 10 * 1024 * 1024;

interface CourseOpt { id: string; code: string; nameVi: string; hasSyllabus: boolean }
type Status = "matching" | "pending" | "analysing" | "ready" | "importing" | "done" | "skipped" | "error";
interface Row {
  key: string;
  file: File;
  courseId: string;
  matchedBy: "name" | "content" | "manual" | null;
  overwrite: boolean;
  status: Status;
  message?: string;
  preview?: SyllabusImportPreview;
  result?: string;
}

const STATUS: Record<Status, { label: string; color: BadgeColor }> = {
  matching: { label: "Đang ghép", color: "slate" },
  pending: { label: "Chờ phân tích", color: "slate" },
  analysing: { label: "Đang phân tích", color: "blue" },
  ready: { label: "Sẵn sàng", color: "blue" },
  importing: { label: "Đang nhập", color: "blue" },
  done: { label: "Đã nhập", color: "green" },
  skipped: { label: "Bỏ qua", color: "amber" },
  error: { label: "Lỗi", color: "red" },
};

export function BulkSyllabusForm({ programId, courses }: { programId: string; courses: CourseOpt[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [useAi, setUseAi] = useState(true);
  const [running, setRunning] = useState<null | "analyse" | "import">(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Latest rows for the sequential loops below (state captured at click time would miss later ticks).
  const rowsRef = useRef<Row[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const course = (id: string) => courses.find((c) => c.id === id);
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setNotice(null);
    const incoming = Array.from(list).filter((f) => !rows.some((r) => r.file.name === f.name && r.file.size === f.size));
    const room = MAX_FILES - rows.length;
    if (incoming.length > room) setNotice(`Chỉ nhận tối đa ${MAX_FILES} tệp mỗi lượt — bỏ qua ${incoming.length - Math.max(0, room)} tệp.`);
    const added: Row[] = incoming.slice(0, Math.max(0, room)).map((file) => {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      if (!/\.docx$/i.test(file.name)) return { key, file, courseId: "", matchedBy: null, overwrite: false, status: "error", message: "Chỉ nhận tệp Word .docx" };
      if (file.size > MAX_BYTES) return { key, file, courseId: "", matchedBy: null, overwrite: false, status: "error", message: "Tệp lớn hơn 10 MB" };
      const hit = matchCourseByFileName(file.name, courses);
      return { key, file, courseId: hit?.id ?? "", matchedBy: hit ? "name" : null, overwrite: false, status: hit ? "pending" : "matching" };
    });
    setRows((rs) => [...rs, ...added]);
    if (inputRef.current) inputRef.current.value = "";
    // Files whose name has no course code: look inside the document (one at a time).
    for (const r of added.filter((x) => x.status === "matching")) {
      const fd = new FormData();
      fd.set("file", r.file);
      const res = await findSyllabusCourseAction(programId, fd);
      update(r.key, res.courseId ? { courseId: res.courseId, matchedBy: "content", status: "pending" } : { status: "pending", message: res.error ?? "Chưa xác định được học phần — chọn ở cột Học phần." });
    }
  }

  // Two files for one course: only the last one would stick, so flag it.
  const dupCourse = (r: Row) => !!r.courseId && rows.filter((x) => x.courseId === r.courseId && x.status !== "error").length > 1;
  const willImport = (r: Row) => r.status === "ready" && !!r.courseId && (!course(r.courseId)?.hasSyllabus || r.overwrite);

  async function analyseAll() {
    setRunning("analyse");
    for (const r of rows) {
      if (!r.courseId || !["pending", "error", "ready"].includes(r.status) || r.message === "Chỉ nhận tệp Word .docx" || r.message === "Tệp lớn hơn 10 MB") continue;
      if (r.status === "ready" && r.preview) continue;
      update(r.key, { status: "analysing", message: undefined });
      const fd = new FormData();
      fd.set("file", r.file);
      if (useAi) fd.set("useAi", "1");
      try {
        const res = await previewSyllabusImportAction(r.courseId, fd);
        update(r.key, res.ok ? { status: "ready", preview: res.preview } : { status: "error", message: res.error });
      } catch (e) {
        update(r.key, { status: "error", message: e instanceof Error ? e.message : "Lỗi phân tích" });
      }
    }
    setRunning(null);
  }

  async function importAll() {
    setRunning("import");
    for (const r of rowsRef.current) {
      if (r.status !== "ready" || !r.preview) continue;
      if (!willImport(r)) {
        update(r.key, { status: "skipped", message: "Học phần đã có đề cương — tích “Ghi đè” để cập nhật." });
        continue;
      }
      update(r.key, { status: "importing" });
      try {
        const p = r.preview;
        const res = await applySyllabusImportAction(r.courseId, {
          fileName: p.fileName,
          fields: p.fields,
          clos: p.clos.map(({ code, description, plos, strength }) => ({ code, description, plos, strength })),
          aiModel: p.ai?.used ? p.ai.model : null,
        });
        if (!res.ok) {
          update(r.key, { status: "error", message: res.error });
          continue;
        }
        const x = res.result;
        const parts = [
          x.syllabus ? `${x.syllabus === "created" ? "tạo" : "cập nhật"} đề cương (${x.fieldsSaved.length} mục)` : null,
          x.closCreated ? `${x.closCreated} CLO mới` : null,
          x.closUpdated ? `${x.closUpdated} CLO cập nhật` : null,
          x.links ? `${x.links} liên kết PLO` : null,
        ].filter(Boolean);
        update(r.key, { status: "done", result: parts.join(", ") || "không có thay đổi", message: x.warnings.length ? `${x.warnings.length} cảnh báo: ${x.warnings.slice(0, 3).join("; ")}` : undefined });
      } catch (e) {
        update(r.key, { status: "error", message: e instanceof Error ? e.message : "Lỗi nhập" });
      }
    }
    setRunning(null);
  }

  const counts = {
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    toImport: rows.filter(willImport).length,
    done: rows.filter((r) => r.status === "done").length,
    unmatched: rows.filter((r) => !r.courseId && r.status !== "error" && r.status !== "matching").length,
  };
  const canAnalyse = rows.some((r) => r.courseId && (r.status === "pending" || (r.status === "error" && r.message && !/\.docx|10 MB/.test(r.message))));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-brand-400"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!running) addFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="h-6 w-6 text-slate-400" />
            <div className="text-sm font-medium text-slate-700">Kéo-thả tệp đề cương vào đây hoặc bấm để chọn (tối đa {MAX_FILES} tệp .docx, mỗi tệp ≤ 10 MB)</div>
            <div className="text-xs text-slate-500">Đặt mã học phần trong tên tệp để ghép tự động, ví dụ DC_LOG101_Nhap_mon_Logistics.docx</div>
            <input ref={inputRef} type="file" accept=".docx" multiple className="hidden" disabled={!!running} onChange={(e) => addFiles(e.target.files)} />
          </div>
          {notice && <p className="text-sm text-amber-700">{notice}</p>}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={useAi} disabled={!!running} onChange={(e) => setUseAi(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            <Sparkles className="h-4 w-4 text-brand-600" /> Dùng AI để hoàn thiện kết quả phân tích (chính xác hơn, khoảng 20–40 giây mỗi tệp)
          </label>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-600">
                {counts.total} tệp · {counts.ready} sẵn sàng · {counts.done} đã nhập
                {counts.unmatched ? <span className="text-amber-700"> · {counts.unmatched} chưa ghép học phần</span> : null}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!!running} onClick={() => setRows([])}>
                  Xóa danh sách
                </Button>
                <Button variant="secondary" size="sm" disabled={!!running || !canAnalyse} onClick={analyseAll}>
                  {running === "analyse" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 1. Phân tích
                </Button>
                <Button size="sm" disabled={!!running || counts.ready === 0} onClick={importAll}>
                  {running === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} 2. Nhập {counts.toImport} đề cương
                </Button>
              </div>
            </div>
            {running && <p className="text-xs text-amber-700">Đang xử lý lần lượt từng tệp — giữ nguyên trang này đến khi xong.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <Th>Tệp</Th>
                    <Th>Học phần</Th>
                    <Th>Kết quả phân tích</Th>
                    <Th>Trạng thái</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const c = course(r.courseId);
                    const p = r.preview;
                    const filled = p ? SYLLABUS_FIELDS.filter((f) => p.fields[f]?.trim()).length : 0;
                    const locked = !!running || r.status === "done" || r.status === "importing";
                    return (
                      <tr key={r.key} className="align-top">
                        <Td className="max-w-64">
                          <div className="break-words font-medium text-slate-800">{r.file.name}</div>
                          <div className="text-xs text-slate-500">{(r.file.size / 1024).toFixed(0)} KB</div>
                        </Td>
                        <Td className="w-72">
                          <Select
                            value={r.courseId}
                            disabled={locked || r.status === "matching"}
                            className="h-8 text-xs"
                            onChange={(e) => update(r.key, { courseId: e.target.value, matchedBy: "manual", preview: undefined, status: e.target.value ? "pending" : r.status, message: undefined })}
                          >
                            <option value="">— Chọn học phần —</option>
                            {courses.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.code} — {x.nameVi}
                              </option>
                            ))}
                          </Select>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            {r.matchedBy === "name" && <span>ghép theo tên tệp</span>}
                            {r.matchedBy === "content" && <span>ghép theo nội dung</span>}
                            {dupCourse(r) && <span className="text-red-600">trùng học phần với tệp khác</span>}
                            {c?.hasSyllabus && (
                              <label className="inline-flex items-center gap-1 text-amber-700">
                                <input type="checkbox" checked={r.overwrite} disabled={locked} onChange={(e) => update(r.key, { overwrite: e.target.checked })} />
                                Đã có đề cương — ghi đè
                              </label>
                            )}
                          </div>
                        </Td>
                        <Td className="text-xs text-slate-600">
                          {p ? (
                            <div className="space-y-0.5">
                              <div>
                                {filled}/{SYLLABUS_FIELDS.length} mục · {p.clos.length} CLO {p.ai?.used && <Badge color="purple">AI</Badge>}
                              </div>
                              {p.warnings.length > 0 && (
                                <details>
                                  <summary className="cursor-pointer text-amber-700">{p.warnings.length} cảnh báo</summary>
                                  <ul className="mt-1 list-disc pl-4 text-amber-700">
                                    {p.warnings.slice(0, 8).map((w) => (
                                      <li key={w}>{w}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                          {r.result && <div className="text-green-700">{r.result}</div>}
                          {r.message && (
                            <div className={r.status === "error" ? "text-red-600" : "text-amber-700"}>
                              {r.status === "error" ? <XCircle className="mr-1 inline h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
                              {r.message}
                            </div>
                          )}
                        </Td>
                        <Td>
                          <Badge color={STATUS[r.status].color}>
                            {(r.status === "analysing" || r.status === "importing" || r.status === "matching") && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                            {STATUS[r.status].label}
                          </Badge>
                          {r.status === "done" && c && (
                            <Link href={`/syllabi/${c.id}`} className="mt-1 block text-xs text-brand-700 hover:underline">
                              Mở đề cương →
                            </Link>
                          )}
                        </Td>
                        <Td>
                          <button
                            type="button"
                            disabled={locked}
                            title="Bỏ tệp này"
                            className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {counts.done > 0 && !running && (
              <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                <span>Đã nhập {counts.done} đề cương (trạng thái Nháp). Kiểm tra lại từng đề cương trước khi gửi duyệt.</span>
                <Link href={`/syllabi?program=${programId}`} className="font-medium hover:underline">
                  Về danh sách đề cương →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
