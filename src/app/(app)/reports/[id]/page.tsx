import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, CardContent, Badge, PageHeader, Button } from "@/components/ui";
import { Progress } from "@/components/widgets";
import { reportStatus } from "@/lib/labels";
import { ReportSectionStatus, ReportStatus } from "@/generated/prisma/enums";
import { pct } from "@/lib/utils";
import { SectionEditor } from "./SectionEditor";
import { setReportStatusAction } from "../actions";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const report = await prisma.selfAssessmentReport.findUnique({
    where: { id },
    include: {
      cycle: { include: { program: true } },
      sections: { orderBy: { order: "asc" }, include: { criterion: true } },
    },
  });
  if (!report) notFound();

  const links = await prisma.evidenceCriterionLink.groupBy({
    by: ["criterionId"],
    where: { evidence: { programId: report.cycle.programId } },
    _count: { _all: true },
  });
  const countByCrit = new Map(links.map((l) => [l.criterionId, l._count._all]));

  const total = report.sections.length;
  const done = report.sections.filter((s) => s.status === ReportSectionStatus.DONE).length;
  const progress = pct(done, total);
  const canWrite = can(user.role, "report:write");
  const canApprove = can(user.role, "report:approve");

  return (
    <div>
      <PageHeader
        title={report.title}
        description={`${report.cycle.program.code} · ${report.cycle.name}`}
        actions={<Badge color={reportStatus[report.status].color}>{reportStatus[report.status].label}</Badge>}
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-64">
            <div className="mb-1 flex justify-between text-sm text-slate-600">
              <span>Tiến độ hoàn thành: {done}/{total} mục</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
          {canApprove && report.status !== ReportStatus.APPROVED && (
            <form action={setReportStatusAction.bind(null, report.id, ReportStatus.APPROVED)}>
              <Button type="submit" size="sm">
                <CheckCircle2 className="h-4 w-4" /> Phê duyệt báo cáo
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {report.sections.map((s) => (
          <SectionEditor
            key={s.id}
            canWrite={canWrite}
            section={{
              id: s.id,
              title: s.title,
              content: s.content,
              strengths: s.strengths,
              weaknesses: s.weaknesses,
              improvementPlan: s.improvementPlan,
              status: s.status,
              linkedCount: s.criterionId ? countByCrit.get(s.criterionId) ?? 0 : 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
