"use client";

import { useActionState } from "react";
import { uploadEvidence, type FormState } from "../actions";
import { Button, Input, Label, Select, Textarea, LinkButton } from "@/components/ui";

export function UploadForm({
  programId,
  criteria,
}: {
  programId: string;
  criteria: Array<{ id: string; code: string; title: string }>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadEvidence, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="programId" value={programId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="code">Mã minh chứng *</Label>
          <Input id="code" name="code" placeholder="VD: E-1.1-02" required />
        </div>
        <div>
          <Label htmlFor="providerUnit">Đơn vị cung cấp</Label>
          <Input id="providerUnit" name="providerUnit" placeholder="VD: Phòng Đào tạo" />
        </div>
      </div>

      <div>
        <Label htmlFor="title">Tên minh chứng *</Label>
        <Input id="title" name="title" placeholder="VD: Biên bản họp Hội đồng KH&ĐT" required />
      </div>

      <div>
        <Label htmlFor="description">Mô tả</Label>
        <Textarea id="description" name="description" rows={2} placeholder="Mô tả ngắn nội dung minh chứng…" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="confidentiality">Mức bảo mật</Label>
          <Select id="confidentiality" name="confidentiality" defaultValue="INTERNAL">
            <option value="PUBLIC">Công khai</option>
            <option value="INTERNAL">Nội bộ</option>
            <option value="CONFIDENTIAL">Mật</option>
            <option value="RESTRICTED">Hạn chế</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="criterionId">Gắn tiêu chí (tùy chọn)</Label>
          <Select id="criterionId" name="criterionId" defaultValue="">
            <option value="">— Chưa gắn —</option>
            {criteria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="file">Tệp minh chứng (PDF, DOCX, XLSX, TXT)</Label>
        <Input id="file" name="file" type="file" accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.csv" className="h-auto py-1.5" />
        <p className="mt-1 text-xs text-slate-400">Hệ thống sẽ tự trích xuất nội dung để AI tóm tắt và gợi ý tiêu chí.</p>
      </div>

      {state.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang tải lên…" : "Tải lên minh chứng"}
        </Button>
        <LinkButton href={`/evidence?program=${programId}`} variant="outline">
          Hủy
        </LinkButton>
      </div>
    </form>
  );
}
