import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Select, Label } from "@/components/ui";
import { roleLabel } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { ApprovalStatus, type Role } from "@/generated/prisma/enums";
import { submitForApprovalAction } from "./actions";

interface FlowStep {
  id: string;
  step: number;
  status: ApprovalStatus;
  note: string | null;
  decidedAt: Date | null;
  approver: { fullName: string } | null;
}
interface UserLite {
  id: string;
  fullName: string;
  role: Role;
}

const STATUS_META: Record<ApprovalStatus, { label: string; color: "amber" | "green" | "red" }> = {
  PENDING: { label: "Chờ duyệt", color: "amber" },
  APPROVED: { label: "Đã duyệt", color: "green" },
  REJECTED: { label: "Từ chối", color: "red" },
};

export function ApprovalPanel({
  entityType,
  entityId,
  steps,
  users,
  canSubmit,
}: {
  entityType: string;
  entityId: string;
  steps: FlowStep[];
  users: UserLite[];
  canSubmit: boolean;
}) {
  const active = steps.length > 0 && steps.some((s) => s.status === ApprovalStatus.PENDING);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Quy trình phê duyệt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.length > 0 ? (
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {s.step}
                  </span>
                  <span className="text-slate-700">{s.approver?.fullName ?? "—"}</span>
                  {s.note && <span className="text-xs italic text-slate-400">“{s.note}”</span>}
                </span>
                <span className="flex items-center gap-2">
                  {s.decidedAt && <span className="text-xs text-slate-400">{formatDate(s.decidedAt)}</span>}
                  <Badge color={STATUS_META[s.status].color}>{STATUS_META[s.status].label}</Badge>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">Chưa gửi phê duyệt. Chọn người phê duyệt theo thứ tự và gửi.</p>
        )}

        {canSubmit && (
          <form action={submitForApprovalAction.bind(null, entityType, entityId)} className="border-t border-slate-100 pt-3">
            <Label>{active ? "Gửi lại quy trình phê duyệt" : "Gửi phê duyệt (theo thứ tự bước)"}</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <Select key={n} name={`approver${n}`} defaultValue="">
                  <option value="">{n === 1 ? "Bước 1 — chọn người duyệt" : `Bước ${n} (tùy chọn)`}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} — {roleLabel(u.role)}
                    </option>
                  ))}
                </Select>
              ))}
            </div>
            <Button type="submit" size="sm" className="mt-2">
              Gửi phê duyệt
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
