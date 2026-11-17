"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { FileText, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { createProgram, parseProgramDocxAction, type FormState, type ProgramPrefill } from "../actions";
import { Button, Input, Label, Select, Textarea, LinkButton } from "@/components/ui";

const EMPTY: ProgramPrefill = {
  code: "",
  nameVi: "",
  nameEn: "",
  facultyId: "",
  degreeLevel: "BACHELOR",
  totalCredits: "",
  objectives: "",
  description: "",
  versionLabel: "",
  versionYear: "",
  versionSummary: "",
};

export function ProgramForm({ faculties }: { faculties: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createProgram, {});
  const fileRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState<ProgramPrefill>(EMPTY);
  // Bumped after a Word import so the uncontrolled inputs re-mount with the new defaults.
  const [formKey, setFormKey] = useState(0);
  const [docx, setDocx] = useState<{ file: string; found: string[]; warnings: string[] } | { error: string } | null>(null);
  const [reading, startReading] = useTransition();

  const readWord = (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startReading(async () => {
      const r = await parseProgramDocxAction(fd);
      if (!r.ok) return setDocx({ error: r.error });
      setV(r.prefill);
      setFormKey((k) => k + 1);
      setDocx({ file: file.name, found: r.found, warnings: r.warnings });
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={(e) => readWord(e.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" disabled={reading} onClick={() => fileRef.current?.click()}>
            {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Điền từ file Word
          </Button>
          <span className="text-xs text-slate-500">
            Tệp .docx có bảng khai báo (Mã chương trình, Tên, Tên tiếng Anh, Trình độ, Tổng số tín chỉ, Khoa, Mục tiêu chung, PO1…, Phiên bản). Xem lại trước khi bấm Tạo.
          </span>
        </div>
        {docx && "error" in docx && <p className="mt-2 text-sm text-red-600">{docx.error}</p>}
        {docx && "file" in docx && (
          <div className="mt-2 space-y-1 text-xs">
            <p className="flex items-start gap-1 text-green-700">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Đã điền từ {docx.file}: {docx.found.join(", ")}.
            </p>
            {docx.warnings.map((w) => (
              <p key={w} className="flex items-start gap-1 text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}
      </div>

      <form key={formKey} action={action} className="space-y-4">
        {docx && "file" in docx && <input type="hidden" name="fromWord" value={docx.file} />}
        <input type="hidden" name="versionLabel" value={v.versionLabel} />
        <input type="hidden" name="versionYear" value={v.versionYear} />
        <input type="hidden" name="versionSummary" value={v.versionSummary} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="code">Mã chương trình *</Label>
            <Input id="code" name="code" placeholder="VD: MIS" required defaultValue={v.code} />
          </div>
          <div>
            <Label htmlFor="facultyId">Khoa / Viện *</Label>
            <Select id="facultyId" name="facultyId" required defaultValue={v.facultyId}>
              <option value="" disabled>
                — Chọn khoa —
              </option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="nameVi">Tên chương trình (tiếng Việt) *</Label>
          <Input id="nameVi" name="nameVi" placeholder="VD: Hệ thống thông tin quản lý" required defaultValue={v.nameVi} />
        </div>
        <div>
          <Label htmlFor="nameEn">Tên tiếng Anh</Label>
          <Input id="nameEn" name="nameEn" placeholder="VD: Management Information Systems" defaultValue={v.nameEn} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="degreeLevel">Trình độ</Label>
            <Select id="degreeLevel" name="degreeLevel" defaultValue={v.degreeLevel}>
              <option value="BACHELOR">Đại học</option>
              <option value="MASTER">Thạc sĩ</option>
              <option value="DOCTORATE">Tiến sĩ</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="totalCredits">Tổng số tín chỉ</Label>
            <Input id="totalCredits" name="totalCredits" type="number" placeholder="VD: 130" defaultValue={v.totalCredits} />
          </div>
        </div>

        <div>
          <Label htmlFor="objectives">Mục tiêu đào tạo</Label>
          <Textarea id="objectives" name="objectives" rows={v.objectives ? 8 : 3} placeholder="Mô tả ngắn mục tiêu đào tạo…" defaultValue={v.objectives} />
        </div>
        <div>
          <Label htmlFor="description">Mô tả</Label>
          <Textarea id="description" name="description" rows={2} placeholder="VD: Mã ngành, quyết định ban hành…" defaultValue={v.description} />
        </div>
        {v.versionLabel && (
          <p className="rounded-lg bg-brand-50/60 px-3 py-2 text-xs text-slate-600">
            Sẽ tạo phiên bản chương trình <b>{v.versionLabel}</b>
            {v.versionSummary ? ` — ${v.versionSummary}` : ""}.
          </p>
        )}

        {state.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending || reading}>
            {pending ? "Đang lưu…" : "Tạo chương trình"}
          </Button>
          <LinkButton href="/programs" variant="outline">
            Hủy
          </LinkButton>
        </div>
      </form>
    </div>
  );
}
