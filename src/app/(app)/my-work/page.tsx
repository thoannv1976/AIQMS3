import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { allowedProgramIds } from "@/lib/access";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader } from "@/components/ui";
import { taskStatus, taskPriority, reportSectionStatus, evidenceStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { EvidenceStatus, ReportSectionStatus, TaskStatus } from "@/generated/prisma/enums";

function dueBadge(d: Date | null) {
  if (!d) return null;
  const days = Math.floor((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  if (days < 0) return <Badge color="red">Quá hạn {-days} ngày</Badge>;
  if (days === 0) return <Badge color="amber">Hạn hôm nay</Badge>;
  if (days <= 3) return <Badge color="amber">Còn {days} ngày</Badge>;
  return <span className="text-xs text-slate-500">Hạn {formatDate(d)}</span>;
}

export default async function MyWorkPage() {
  const user = await requireUser();
  const scope = await allowedProgramIds(user);
  const programFilter = scope ? { programId: { in: scope } } : {};

  const [tasks, writing, reviewing, approvals, revisions, toApprove] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: user.id, status: { not: TaskStatus.DONE } },
      orderBy: [{ dueDate: "asc" }],
      include: { program: { select: { code: true } }, criterion: { select: { code: true } } },
    }),
    prisma.reportSection.findMany({
      where: { assignedToId: user.id, status: { not: ReportSectionStatus.DONE } },
      include: { report: { select: { id: true, title: true, cycle: { select: { targetDate: true } } } } },
      orderBy: { order: "asc" },
      take: 50,
    }),
    prisma.reportSection.findMany({
      where: { reviewerId: user.id, status: { in: [ReportSectionStatus.REVIEW, ReportSectionStatus.DRAFTING] } },
      include: { report: { select: { id: true, title: true } } },
      take: 50,
    }),
    prisma.approvalFlow.findMany({ where: { approverId: user.id, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.evidence.findMany({ where: { uploadedById: user.id, status: EvidenceStatus.NEEDS_REVISION }, select: { id: true, code: true, title: true } }),
    can(user.role, "evidence:approve")
      ? prisma.evidence.findMany({
          where: { ...programFilter, status: { in: [EvidenceStatus.SUBMITTED, EvidenceStatus.REVIEWED] } },
          select: { id: true, code: true, title: true, status: true, program: { select: { code: true } } },
          take: 30,
        })
      : Promise.resolve([]),
  ]);

  const total = tasks.length + writing.length + reviewing.length + approvals.length + revisions.length + toApprove.length;

  return (
    <div>
      <PageHeader title="Việc của tôi" description={`${total} việc đang chờ bạn — nhiệm vụ, mục báo cáo, phê duyệt và minh chứng`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nhiệm vụ được giao ({tasks.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.length === 0 && <p className="text-sm text-slate-500">Không có nhiệm vụ nào.</p>}
            {tasks.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div>
                  <Link href={`/tasks?program=${t.programId ?? ""}`} className="font-medium text-slate-800 hover:text-brand-600">
                    {t.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {t.program?.code} {t.criterion && `· TC ${t.criterion.code}`} · <Badge color={taskPriority[t.priority].color}>{taskPriority[t.priority].label}</Badge>{" "}
                    <Badge color={taskStatus[t.status].color}>{taskStatus[t.status].label}</Badge>
                  </div>
                </div>
                {dueBadge(t.dueDate)}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phê duyệt đang chờ tôi ({approvals.length + toApprove.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {approvals.length + toApprove.length === 0 && <p className="text-slate-500">Không có yêu cầu phê duyệt.</p>}
            {approvals.map((a) => (
              <Link key={a.id} href={a.entityType === "report" ? `/reports/${a.entityId}` : "/approvals"} className="block rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                Bước {a.step} · {a.entityType === "report" ? "Báo cáo tự đánh giá" : a.entityType} · gửi {formatDate(a.createdAt)}
              </Link>
            ))}
            {toApprove.map((e) => (
              <Link key={e.id} href={`/evidence/${e.id}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                <span>
                  {e.program.code} · <b>{e.code}</b> {e.title}
                </span>
                <Badge color={evidenceStatus[e.status].color}>{evidenceStatus[e.status].label}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mục báo cáo tôi viết ({writing.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {writing.length === 0 && <p className="text-slate-500">Không có mục nào.</p>}
            {writing.map((s) => (
              <Link key={s.id} href={`/reports/${s.report.id}`} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                <span className="line-clamp-2">{s.title}</span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge color={reportSectionStatus[s.status].color}>{reportSectionStatus[s.status].label}</Badge>
                  {dueBadge(s.report.cycle.targetDate)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mục báo cáo tôi phản biện ({reviewing.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {reviewing.length === 0 && <p className="text-slate-500">Không có mục nào.</p>}
            {reviewing.map((s) => (
              <Link key={s.id} href={`/reports/${s.report.id}`} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                <span className="line-clamp-2">{s.title}</span>
                <Badge color={reportSectionStatus[s.status].color}>{reportSectionStatus[s.status].label}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        {revisions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Minh chứng cần tôi bổ sung ({revisions.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {revisions.map((e) => (
                <Link key={e.id} href={`/evidence/${e.id}`} className="block rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                  <b>{e.code}</b> {e.title}
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
