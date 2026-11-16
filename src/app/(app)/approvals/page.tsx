import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card, CardContent, EmptyState, Badge, Button, Textarea } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ApprovalStatus } from "@/generated/prisma/enums";
import { decideApprovalAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const user = await requireUser();

  const myPending = await prisma.approvalFlow.findMany({
    where: { approverId: user.id, status: ApprovalStatus.PENDING },
    orderBy: { createdAt: "desc" },
    include: { requestedBy: { select: { fullName: true } } },
  });

  const all = myPending.length
    ? await prisma.approvalFlow.findMany({
        where: { OR: myPending.map((m) => ({ entityType: m.entityType, entityId: m.entityId })) },
        select: { entityType: true, entityId: true, step: true, status: true },
      })
    : [];

  // Only steps whose predecessors are all approved are actionable now.
  const actionable = myPending.filter(
    (m) => !all.some((s) => s.entityType === m.entityType && s.entityId === m.entityId && s.step < m.step && s.status !== ApprovalStatus.APPROVED),
  );

  const reportIds = actionable.filter((a) => a.entityType === "report").map((a) => a.entityId);
  const reports = reportIds.length
    ? await prisma.selfAssessmentReport.findMany({ where: { id: { in: reportIds } }, select: { id: true, title: true } })
    : [];
  const reportTitle = Object.fromEntries(reports.map((r) => [r.id, r.title]));

  return (
    <div>
      <PageHeader title="Phê duyệt" description="Các yêu cầu đang chờ bạn phê duyệt theo quy trình nhiều bước." />

      {actionable.length === 0 ? (
        <EmptyState title="Không có yêu cầu chờ duyệt" description="Khi đến lượt bạn trong một quy trình phê duyệt, yêu cầu sẽ hiển thị ở đây." />
      ) : (
        <div className="space-y-4">
          {actionable.map((a) => {
            const title = a.entityType === "report" ? reportTitle[a.entityId] ?? "Báo cáo tự đánh giá" : `${a.entityType} ${a.entityId}`;
            return (
              <Card key={a.id}>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color="amber">Bước {a.step}</Badge>
                    {a.entityType === "report" ? (
                      <Link href={`/reports/${a.entityId}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {title}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-900">{title}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Người yêu cầu: {a.requestedBy?.fullName ?? "—"} · {formatDate(a.createdAt)}
                  </p>
                  <form className="space-y-2">
                    <Textarea name="note" rows={2} placeholder="Ý kiến phê duyệt (tùy chọn)…" />
                    <div className="flex gap-2">
                      <Button type="submit" formAction={decideApprovalAction.bind(null, a.id, "APPROVED")}>
                        Phê duyệt
                      </Button>
                      <Button type="submit" variant="outline" formAction={decideApprovalAction.bind(null, a.id, "REJECTED")}>
                        Từ chối
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
