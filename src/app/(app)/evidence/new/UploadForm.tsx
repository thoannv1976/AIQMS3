"use client";

import Link from "next/link";
import { useActionState } from "react";
import { uploadEvidence, type FormState } from "../actions";
import { Button, Input, Label, Select, Textarea, LinkButton } from "@/components/ui";

const ACCEPT = ".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";

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
          <Input id="code" name="code" placeholder="VD: MC-1.1.01" required />
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="issuedAt">Ngày ban hành</Label>
          <Input id="issuedAt" name="issuedAt" type="date" />
        </div>
        <div>
          <Label htmlFor="validUntil">Hiệu lực đến</Label>
          <Input id="validUntil" name="validUntil" type="date" />
          <p className="mt-1 text-xs text-slate-400">Để trống nếu không có thời hạn.</p>
        </div>
      </div>

      <div>
        <Label htmlFor="file">Tệp minh chứng (PDF, DOCX, XLSX, PPTX, ảnh JPG/PNG, TXT)</Label>
        <Input id="file" name="file" type="file" accept={ACCEPT} className="h-auto py-1.5" />
        <p className="mt-1 text-xs text-slate-400">
          Hệ thống tự trích xuất nội dung; bản scan PDF và ảnh được AI đọc (OCR) để tóm tắt và gợi ý tiêu chí.
        </p>
      </div>

      {state.error && (
        <div className="space-y-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <div>{state.error}</div>
          {state.duplicate && (
            <>
              <Link href={`/evidence/${state.duplicate.id}`} className="font-medium underline" target="_blank">
                Mở minh chứng {state.duplicate.code}
              </Link>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" name="force" /> Vẫn tải lên (tệp trùng nội dung)
              </label>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang tải lên…" : "Tải lên minh chứng"}
        </Button>
        <LinkButton href={`/evidence?program=${programId}`} variant="outline">
          Hủy
        </LinkButton>
        <Link href={`/evidence/bulk?program=${programId}`} className="ml-auto text-sm text-brand-600 hover:underline">
          Tải nhiều tệp cùng lúc →
        </Link>
      </div>
    </form>
  );
}
