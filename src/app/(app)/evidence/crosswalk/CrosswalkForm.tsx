"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, Eye } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Label, Select, Th, Td } from "@/components/ui";
import { previewCrosswalkAction, applyCrosswalkAction, type CrosswalkPreviewResult } from "./actions";

export interface SetOption {
  id: string;
  code: string;
  name: string;
  standards: number;
  criteria: number;
  links: number;
}

const setLabel = (s: SetOption) => `${s.name.split("—")[0].trim()} (${s.code}) · ${s.standards} tiêu chuẩn, ${s.criteria} tiêu chí`;

function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

export function CrosswalkForm({
  programId,
  sets,
  defaultTarget,
  defaultSource,
}: {
  programId: string;
  sets: SetOption[];
  defaultTarget: string;
  defaultSource: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [targetSetId, setTarget] = useState(defaultTarget);
  const [source, setSource] = useState<"file" | "identity">("file");
  const [files, setFiles] = useState<File[]>([]);
  const [oldFrom, setOldFrom] = useState<"links" | "code">("links");
  const [sourceSetId, setSourceSet] = useState(defaultSource);
  const [rename, setRename] = useState(false);
  const [onlyWarn, setOnlyWarn] = useState(false);
  const [preview, setPreview] = useState<CrosswalkPreviewResult | null>(null);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  // Any change of options invalidates the preview.
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPreview(null);
    setDone(null);
  };

  const fd = () => {
    const f = new FormData();
    f.set("targetSetId", targetSetId);
    f.set("source", source);
    f.set("oldFrom", oldFrom);
    f.set("sourceSetId", sourceSetId);
    f.set("rename", rename ? "1" : "0");
    if (source === "file") files.forEach((x) => f.append("files", x));
    return f;
  };

  const p = preview?.ok ? preview.preview : null;
  const rows = useMemo(() => (p ? (onlyWarn ? p.rows.filter((r) => r.warnings.length || r.skip) : p.rows) : []), [p, onlyWarn]);
  const canPreview = Boolean(targetSetId) && (source === "identity" || files.length > 0) && (oldFrom === "code" || Boolean(sourceSetId));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 pt-5">
          <section className="space-y-2">
            <Label>1. Bộ tiêu chuẩn đích</Label>
            <Select value={targetSetId} onChange={(e) => change(setTarget)(e.target.value)} className="max-w-xl">
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {setLabel(s)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-500">Mặc định là bộ tiêu chuẩn của chu kỳ kiểm định mới nhất của chương trình.</p>
          </section>

          <section className="space-y-2">
            <Label>2. Nguồn bảng chuyển mã</Label>
            <Radio name="source" checked={source === "file"} onChange={() => change(setSource)("file")}>
              Tải lên bảng chuyển mã Excel (cột <i>Tiêu chí cũ</i>/<i>Mã cũ</i> và <i>Tiêu chí mới</i>/<i>Mã mới</i>; tiêu chí mới có thể ghi nhiều mã, cách nhau
              dấu , hoặc ;)
            </Radio>
            {source === "file" && (
              <div className="ml-6 flex flex-wrap items-center gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={(e) => change(setFiles)(e.target.files ? Array.from(e.target.files) : [])}
                />
                <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Chọn tệp
                </Button>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download route, not a page */}
                <a href="/evidence/crosswalk-template" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
                  <Download className="h-4 w-4" /> Tải tệp mẫu
                </a>
                <span className="text-sm text-slate-500">{files.length ? files.map((f) => f.name).join(", ") : "Chưa chọn tệp"}</span>
              </div>
            )}
            <Radio name="source" checked={source === "identity"} onChange={() => change(setSource)("identity")}>
              Giữ nguyên mã — tiêu chí cũ x.y được gắn sang tiêu chí x.y của bộ đích
            </Radio>
          </section>

          <section className="space-y-2">
            <Label>3. Xác định tiêu chí cũ của mỗi minh chứng</Label>
            <Radio name="oldFrom" checked={oldFrom === "links"} onChange={() => change(setOldFrom)("links")}>
              Theo liên kết tiêu chí hiện có trong bộ tiêu chuẩn nguồn
            </Radio>
            {oldFrom === "links" && (
              <Select value={sourceSetId} onChange={(e) => change(setSourceSet)(e.target.value)} className="ml-6 max-w-xl">
                <option value="">— Chọn bộ nguồn —</option>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {setLabel(s)} · {s.links} liên kết
                  </option>
                ))}
              </Select>
            )}
            <Radio name="oldFrom" checked={oldFrom === "code"} onChange={() => change(setOldFrom)("code")}>
              Đọc từ mã minh chứng (MC-x.y.zz → tiêu chí x.y)
            </Radio>
            <p className="text-xs text-slate-500">
              Nếu bảng chuyển mã liệt kê theo từng minh chứng (cột Mã cũ dạng 1.2.04), minh chứng có mã tương ứng sẽ được khớp trực tiếp theo mã.
            </p>
          </section>

          <section className="space-y-2">
            <Label>4. Tùy chọn</Label>
            <label className="flex items-center gap-2 text-sm text-slate-500">
              <input type="checkbox" checked disabled /> Gắn thêm liên kết tới tiêu chí mới (liên kết cũ được giữ nguyên)
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5" checked={rename} onChange={(e) => change(setRename)(e.target.checked)} />
              <span>
                Đổi mã minh chứng theo tiêu chí mới — đánh số lại MC-&lt;tiêu chí chính&gt;.NN theo thứ tự mã cũ, tiếp nối các mã đã dùng trong chương trình, và
                ghi &quot;Mã cũ: …&quot; vào mô tả
              </span>
            </label>
          </section>

          <div className="flex items-center gap-3">
            <Button disabled={!canPreview || pending} onClick={() => start(async () => setPreview(await previewCrosswalkAction(programId, fd())))}>
              {pending && !p ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Xem trước
            </Button>
            {preview && !preview.ok && <p className="text-sm text-red-600">{preview.error}</p>}
          </div>
        </CardContent>
      </Card>

      {p && (
        <Card>
          <CardHeader>
            <CardTitle>5. Xem trước chuyển mã sang {p.targetSet.name.split("—")[0].trim()}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-5">
              {(
                [
                  ["Minh chứng", p.totals.evidence],
                  ["Sẽ chuyển", p.totals.ready],
                  ["Liên kết mới", p.totals.linksToAdd],
                  ["Đổi mã", p.options.rename ? p.totals.renamed : "—"],
                  ["Bỏ qua", p.totals.skipped],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-xl font-semibold text-slate-800">{v}</div>
                </div>
              ))}
            </div>
            {p.mapping && (
              <div className="space-y-1 text-xs text-slate-500">
                <div>
                  Bảng chuyển mã: {p.mapping.criterion} dòng theo tiêu chí, {p.mapping.evidence} dòng theo mã minh chứng
                  {p.mapping.skippedNoOld ? ` · ${p.mapping.skippedNoOld} dòng không có mã cũ (bỏ qua)` : ""} · {p.mapping.sheets.map((s) => s.where).join("; ")}
                </div>
                {p.mapping.issues.length > 0 && (
                  <ul className="max-h-32 space-y-0.5 overflow-auto rounded bg-amber-50 p-2 text-amber-800">
                    {p.mapping.issues.map((i, k) => (
                      <li key={k}>
                        {i.where}: {i.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={onlyWarn} onChange={(e) => setOnlyWarn(e.target.checked)} /> Chỉ hiện dòng có cảnh báo ({p.totals.warnings})
            </label>
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <Th>Mã minh chứng</Th>
                    <Th>Tiêu chí cũ</Th>
                    <Th>Tiêu chí mới</Th>
                    {p.options.rename && <Th>Mã mới</Th>}
                    <Th>Cảnh báo</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.evidenceId} className={r.skip ? "bg-slate-50 text-slate-400" : ""}>
                      <Td className="whitespace-nowrap py-2 font-medium" title={r.title}>
                        {r.code}
                      </Td>
                      <Td className="py-2">
                        {r.old || "—"}
                        {r.matchedCode && <div className="text-xs text-slate-500">khớp mã cũ {r.matchedCode}</div>}
                      </Td>
                      <Td className="py-2">
                        {r.newCriteria.length ? (
                          <div className="flex flex-wrap gap-1">
                            {r.newCriteria.map((c, i) => (
                              <Badge key={c} color={i === 0 ? "blue" : "slate"}>
                                {c}
                              </Badge>
                            ))}
                            {r.addLinks < r.newCriteria.length && !r.skip && (
                              <span className="text-xs text-slate-400">({r.newCriteria.length - r.addLinks} đã có)</span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </Td>
                      {p.options.rename && (
                        <Td className="whitespace-nowrap py-2">
                          {r.newCode && r.newCode !== r.code ? <b className="text-brand-700">{r.newCode}</b> : r.newCode ? <span className="text-slate-400">giữ nguyên</span> : "—"}
                        </Td>
                      )}
                      <Td className="py-2 text-xs">
                        {r.warnings.map((w, i) => (
                          <div key={i} className="flex gap-1 text-amber-700">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                          </div>
                        ))}
                      </Td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <Td colSpan={5} className="text-center text-slate-500">
                        Không có dòng nào.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
              <Button
                disabled={pending || p.totals.ready === 0}
                onClick={() => {
                  const msg = p.options.rename
                    ? `Gắn liên kết và đổi mã ${p.totals.renamed} minh chứng? Mã cũ sẽ được ghi vào mô tả.`
                    : `Gắn ${p.totals.linksToAdd} liên kết mới cho ${p.totals.ready} minh chứng?`;
                  if (!window.confirm(msg)) return;
                  start(async () => {
                    const r = await applyCrosswalkAction(programId, fd());
                    if (r.ok) {
                      setDone({
                        ok: true,
                        text: `Đã chuyển mã ${r.result.evidence} minh chứng: ${r.result.linksCreated} liên kết mới${r.result.renamed ? `, ${r.result.renamed} mã được đổi` : ""}.`,
                      });
                      setPreview(null);
                    } else setDone({ ok: false, text: "Lỗi: " + r.error });
                  });
                }}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} 6. Áp dụng chuyển mã
              </Button>
              {p.totals.skipped > 0 && <Badge color="amber">{p.totals.skipped} minh chứng bị bỏ qua</Badge>}
              <span className="text-xs text-slate-500">Dữ liệu được tính lại trên máy chủ khi áp dụng.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {done && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-5 text-sm">
            {done.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />} {done.text}
            {done.ok && (
              <Link className="text-brand-700 hover:underline" href={`/evidence/matrix?program=${programId}`}>
                Mở ma trận minh chứng →
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
