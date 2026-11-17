"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { UploadCloud, CheckCircle2, XCircle, Loader2, Copy, Trash2 } from "lucide-react";
import { Button, Card, CardContent, Input, Select, Badge, Label } from "@/components/ui";
import { Progress } from "@/components/widgets";
import { parseEvidenceFilename } from "@/lib/evidence/filename";
import { uploadEvidenceItemAction } from "../actions";

const ACCEPT = ".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";
// Each file goes up in its own request (≤ 15 MB), one after another, so the cap only bounds how
// long one session takes (≈ 2–3 s per file) — it is not a server limit.
const MAX_FILES = 100;
const MAX_BYTES = 15 * 1024 * 1024;

type RowStatus = "ready" | "uploading" | "done" | "error" | "duplicate" | "skipped";
interface Row {
  key: string;
  file: File;
  code: string;
  title: string;
  criterionId: string;
  status: RowStatus;
  message?: string;
  evidenceId?: string;
  duplicate?: { id: string; code: string; title: string };
}

export function BulkUploadForm({
  programId,
  criteria,
  existingCodes,
}: {
  programId: string;
  criteria: Array<{ id: string; code: string; title: string }>;
  existingCodes: string[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [provider, setProvider] = useState("");
  const [confidentiality, setConfidentiality] = useState("INTERNAL");
  const [validUntil, setValidUntil] = useState("");
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [overflow, setOverflow] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const critByCode = useMemo(() => new Map(criteria.map((c) => [c.code, c.id])), [criteria]);
  const taken = useMemo(() => new Set(existingCodes), [existingCodes]);

  // Leaving the page mid-upload would silently stop the queue.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    const fresh = files.filter((f) => !rows.some((r) => r.file.name === f.name && r.file.size === f.size));
    setOverflow(Math.max(0, rows.length + fresh.length - MAX_FILES));
    setRows((prev) => {
      const next = [...prev];
      for (const f of files) {
        if (next.length >= MAX_FILES) break;
        if (next.some((r) => r.file.name === f.name && r.file.size === f.size)) continue;
        const parsed = parseEvidenceFilename(f.name);
        const tooBig = f.size > MAX_BYTES;
        next.push({
          key: `${f.name}-${f.size}-${Math.random()}`,
          file: f,
          code: parsed.code,
          title: parsed.title,
          criterionId: (parsed.criterionCode && critByCode.get(parsed.criterionCode)) || "",
          status: tooBig ? "error" : "ready",
          message: tooBig ? "Tệp lớn hơn 15 MB" : undefined,
        });
      }
      return next;
    });
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function uploadOne(row: Row, force = false) {
    update(row.key, { status: "uploading", message: undefined });
    const fd = new FormData();
    fd.set("programId", programId);
    fd.set("code", row.code);
    fd.set("title", row.title);
    fd.set("criterionId", row.criterionId);
    fd.set("providerUnit", provider);
    fd.set("confidentiality", confidentiality);
    if (validUntil) fd.set("validUntil", validUntil);
    if (force) fd.set("force", "1");
    fd.set("file", row.file);
    try {
      const res = await uploadEvidenceItemAction(fd);
      if (res.ok) update(row.key, { status: "done", evidenceId: res.id });
      else if (res.duplicate) update(row.key, { status: "duplicate", message: res.error, duplicate: res.duplicate });
      else update(row.key, { status: "error", message: res.error });
    } catch (e) {
      update(row.key, { status: "error", message: e instanceof Error ? e.message : "Lỗi tải lên" });
    }
  }

  async function uploadAll() {
    setRunning(true);
    for (const r of rows) {
      if (r.status === "ready" || r.status === "error") {
        if (r.message === "Tệp lớn hơn 15 MB") continue;
        await uploadOne(r);
      }
    }
    setRunning(false);
  }

  const total = rows.length;
  const finished = rows.filter((r) => ["done", "skipped"].includes(r.status)).length;
  const done = rows.filter((r) => r.status === "done").length;
  const dups = rows.filter((r) => r.status === "duplicate").length;
  const errors = rows.filter((r) => r.status === "error").length;
  const codeCounts = rows.reduce<Record<string, number>>((m, r) => ((m[r.code] = (m[r.code] ?? 0) + 1), m), {});

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragOver ? "border-brand-500 bg-brand-50" : "border-slate-300 hover:bg-slate-50"
            }`}
          >
            <UploadCloud className="h-8 w-8 text-brand-500" />
            <div className="text-sm font-medium text-slate-700">Kéo-thả tệp vào đây hoặc bấm để chọn (tối đa {MAX_FILES} tệp, mỗi tệp ≤ 15 MB)</div>
            {overflow > 0 && <div className="text-xs text-amber-700">Đã đạt giới hạn {MAX_FILES} tệp — bỏ qua {overflow} tệp. Tải lượt này xong rồi chọn tiếp.</div>}
            <div className="text-xs text-slate-500">
              Mã minh chứng và tiêu chí được đoán từ tên tệp, ví dụ <code>MC_1.1.01_Quyet_dinh.docx</code> → mã MC-1.1.01, tiêu chí 1.1.
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              aria-label="Chọn tệp minh chứng"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Đơn vị cung cấp (áp dụng cho tất cả)</Label>
              <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="VD: Phòng Khảo thí & ĐBCL" />
            </div>
            <div>
              <Label>Mức bảo mật</Label>
              <Select value={confidentiality} onChange={(e) => setConfidentiality(e.target.value)}>
                <option value="PUBLIC">Công khai</option>
                <option value="INTERNAL">Nội bộ</option>
                <option value="CONFIDENTIAL">Mật</option>
                <option value="RESTRICTED">Hạn chế</option>
              </Select>
            </div>
            <div>
              <Label>Hiệu lực đến (tùy chọn)</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {total > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                {total} tệp · <span className="text-green-700">{done} đã tải</span>
                {dups > 0 && <span className="text-amber-700"> · {dups} trùng</span>}
                {errors > 0 && <span className="text-red-700"> · {errors} lỗi</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={running} onClick={() => { setRows([]); setOverflow(0); }}>
                  Xóa danh sách
                </Button>
                <Button size="sm" disabled={running || rows.every((r) => r.status !== "ready" && r.status !== "error")} onClick={uploadAll}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Tải lên tất cả
                </Button>
              </div>
            </div>
            <Progress value={total ? Math.round((finished / total) * 100) : 0} />
            {running && (
              <p className="text-xs text-amber-700">
                Đang tải {finished + 1 > total ? total : finished + 1}/{total} — giữ nguyên trang này đến khi xong (khoảng {Math.max(1, Math.ceil(((total - finished) * 2.5) / 60))} phút).
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Tệp</th>
                    <th className="px-2 py-2">Mã minh chứng</th>
                    <th className="px-2 py-2">Tên minh chứng</th>
                    <th className="px-2 py-2">Tiêu chí</th>
                    <th className="px-2 py-2">Trạng thái</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const editable = r.status === "ready" || r.status === "error";
                    const codeConflict = taken.has(r.code) || codeCounts[r.code] > 1;
                    return (
                      <tr key={r.key} className="align-top">
                        <td className="max-w-48 px-2 py-2 text-xs text-slate-500">
                          <div className="truncate" title={r.file.name}>
                            {r.file.name}
                          </div>
                          <div>{(r.file.size / 1024).toFixed(0)} KB</div>
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            value={r.code}
                            disabled={!editable}
                            onChange={(e) => update(r.key, { code: e.target.value })}
                            className={`h-8 w-36 text-xs ${codeConflict && editable ? "border-amber-500" : ""}`}
                          />
                          {codeConflict && editable && <div className="mt-0.5 text-[11px] text-amber-700">Mã đã có / bị trùng</div>}
                        </td>
                        <td className="px-2 py-2">
                          <Input value={r.title} disabled={!editable} onChange={(e) => update(r.key, { title: e.target.value })} className="h-8 min-w-56 text-xs" />
                        </td>
                        <td className="px-2 py-2">
                          <Select
                            value={r.criterionId}
                            disabled={!editable}
                            onChange={(e) => update(r.key, { criterionId: e.target.value })}
                            className="h-8 w-28 text-xs"
                          >
                            <option value="">— Chưa gắn —</option>
                            {criteria.map((c) => (
                              <option key={c.id} value={c.id} title={c.title}>
                                {c.code}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {r.status === "ready" && <Badge color="slate">Chờ tải</Badge>}
                          {r.status === "uploading" && (
                            <span className="inline-flex items-center gap-1 text-brand-700">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải…
                            </span>
                          )}
                          {r.status === "done" && (
                            <Link href={`/evidence/${r.evidenceId}`} target="_blank" className="inline-flex items-center gap-1 text-green-700 hover:underline">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Đã tải
                            </Link>
                          )}
                          {r.status === "skipped" && <Badge color="slate">Bỏ qua</Badge>}
                          {r.status === "error" && (
                            <span className="inline-flex items-center gap-1 text-red-700">
                              <XCircle className="h-3.5 w-3.5" /> {r.message}
                            </span>
                          )}
                          {r.status === "duplicate" && r.duplicate && (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <Copy className="h-3.5 w-3.5" /> Trùng với{" "}
                                <Link href={`/evidence/${r.duplicate.id}`} target="_blank" className="underline">
                                  {r.duplicate.code}
                                </Link>
                              </span>
                              <div className="flex gap-2">
                                <button className="text-brand-700 hover:underline" onClick={() => uploadOne(r, true)}>
                                  Vẫn tải
                                </button>
                                <button className="text-slate-500 hover:underline" onClick={() => update(r.key, { status: "skipped" })}>
                                  Bỏ qua
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {editable && (
                            <button title="Bỏ tệp này" className="text-slate-400 hover:text-red-600" onClick={() => setRows((p) => p.filter((x) => x.key !== r.key))}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {finished === total && total > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                <span>Hoàn tất. Hệ thống đang trích xuất nội dung (và OCR bản scan) ở chế độ nền.</span>
                <Link href={`/evidence?program=${programId}`} className="font-medium underline">
                  Về danh sách minh chứng
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
