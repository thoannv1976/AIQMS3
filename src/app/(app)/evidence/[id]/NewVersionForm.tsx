"use client";

import { useActionState, useState } from "react";
import { Upload } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { uploadNewVersionAction, type FormState } from "../actions";

const ACCEPT = ".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";

export function NewVersionForm({ evidenceId }: { evidenceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(uploadNewVersionAction.bind(null, evidenceId), {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
        <Upload className="h-4 w-4" /> Tải phiên bản mới
      </button>
    );
  }
  return (
    <form action={action} className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
      <Input type="file" name="file" accept={ACCEPT} required className="h-auto py-1.5" />
      <div className="grid gap-2 sm:grid-cols-3">
        <Input name="note" placeholder="Ghi chú thay đổi (tùy chọn)" className="sm:col-span-1" />
        <label className="text-xs text-slate-500">
          Ngày ban hành mới
          <Input type="date" name="issuedAt" className="h-8" />
        </label>
        <label className="text-xs text-slate-500">
          Hiệu lực đến
          <Input type="date" name="validUntil" className="h-8" />
        </label>
      </div>
      <p className="text-xs text-slate-500">Bản hiện hành được lưu vào lịch sử; minh chứng chuyển về “Đã upload” để rà soát, phê duyệt lại.</p>
      {state.error && <div className="rounded bg-red-50 px-2 py-1 text-sm text-red-700">{state.error}</div>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Đang tải…" : "Tải lên phiên bản mới"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
