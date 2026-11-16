"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckSquare } from "lucide-react";
import { Button, Select, Input } from "@/components/ui";
import { bulkEvidenceAction, type BulkOp } from "./bulk-actions";

export const BULK_FORM_ID = "ev-bulk";

const OPS: Array<{ value: BulkOp; label: string; need: "approve" | "write" }> = [
  { value: "approve", label: "Duyệt", need: "approve" },
  { value: "needs_revision", label: "Yêu cầu bổ sung", need: "approve" },
  { value: "link_criterion", label: "Gán thêm tiêu chí", need: "write" },
  { value: "set_validity", label: "Đặt ngày hiệu lực đến", need: "write" },
  { value: "set_confidentiality", label: "Đổi mức bảo mật", need: "write" },
  { value: "ai_check", label: "AI kiểm tra (liên quan / hiệu lực)", need: "write" },
];

const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${BULK_FORM_ID}"]`));

/** Header checkbox that toggles every row checkbox bound to the bulk form. */
export function SelectAllBox() {
  return (
    <input
      type="checkbox"
      aria-label="Chọn tất cả"
      onChange={(e) => {
        boxes().forEach((b) => (b.checked = e.target.checked));
        document.dispatchEvent(new Event("ev-bulk-change"));
      }}
    />
  );
}

/** Row checkbox (server-rendered table, client behaviour). */
export function RowBox({ id }: { id: string }) {
  return <input type="checkbox" name="ids" value={id} form={BULK_FORM_ID} aria-label="Chọn" onChange={() => document.dispatchEvent(new Event("ev-bulk-change"))} />;
}

export function EvidenceBulkBar({
  programId,
  canApprove,
  canWrite,
  criteria,
}: {
  programId: string;
  canApprove: boolean;
  canWrite: boolean;
  criteria: Array<{ id: string; code: string; title: string }>;
}) {
  const router = useRouter();
  const ops = OPS.filter((o) => (o.need === "approve" ? canApprove : canWrite));
  const [count, setCount] = useState(0);
  const [op, setOp] = useState<BulkOp>(ops[0]?.value ?? "approve");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const h = () => setCount(boxes().filter((b) => b.checked).length);
    document.addEventListener("ev-bulk-change", h);
    return () => document.removeEventListener("ev-bulk-change", h);
  }, []);
  if (!ops.length) return null;

  return (
    <form
      id={BULK_FORM_ID}
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await bulkEvidenceAction(programId, fd);
          setMsg(r.message);
          if (r.ok) {
            boxes().forEach((b) => (b.checked = false));
            setCount(0);
            router.refresh();
          }
        });
      }}
    >
      <CheckSquare className="h-4 w-4 text-slate-400" />
      <span className="font-medium text-slate-700">Đã chọn {count}</span>
      <Select name="op" value={op} onChange={(e) => setOp(e.target.value as BulkOp)} className="h-8 w-56 text-xs">
        {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      {op === "needs_revision" && <Input name="note" placeholder="Lý do / yêu cầu bổ sung" className="h-8 w-64 text-xs" />}
      {op === "link_criterion" && (
        <Select name="criterionId" className="h-8 w-72 text-xs" defaultValue="">
          <option value="" disabled>— Chọn tiêu chí —</option>
          {criteria.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title.slice(0, 70)}</option>)}
        </Select>
      )}
      {op === "set_validity" && <Input type="date" name="validUntil" className="h-8 w-40 text-xs" title="Để trống = không thời hạn" />}
      {op === "set_confidentiality" && (
        <Select name="confidentiality" className="h-8 w-36 text-xs" defaultValue="INTERNAL">
          <option value="PUBLIC">Công khai</option>
          <option value="INTERNAL">Nội bộ</option>
          <option value="CONFIDENTIAL">Mật</option>
          <option value="RESTRICTED">Hạn chế</option>
        </Select>
      )}
      <Button type="submit" size="sm" disabled={!count || pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Áp dụng
      </Button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </form>
  );
}
