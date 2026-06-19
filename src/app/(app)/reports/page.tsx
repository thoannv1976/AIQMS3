import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, PageHeader, Badge, EmptyState } from "@/components/ui";
import { Progress } from "@/components/widgets";
import { reportStatus } from "@/lib/labels";
import { ReportSectionStatus } from "@/generated/prisma/enums";
import { pct } from "@/lib/utils";

export default async function ReportsPage() {
  await requireUser();
  const reports = await prisma.selfAssessmentReport.findMany({
    include: {
      cycle: { include: { program: true } },
      sections: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader title="Báo cáo tự đánh giá (SAR)" description="Soạn thảo, rà soát và phê duyệt báo cáo tự đánh giá theo tiêu chuẩn" />

      {reports.length === 0 ? (
        <EmptyState title="Chưa có báo cáo tự đánh giá" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((r) => {
            const total = r.sections.length;
            const done = r.sections.filter((s) => s.status === ReportSectionStatus.DONE).length;
            const progress = pct(done, total);
            return (
              <Link key={r.id} href={`/reports/${r.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-5 w-5 text-brand-500" />
                        <div>
                          <h3 className="font-semibold text-slate-900">{r.title}</h3>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {r.cycle.program.code} · {r.cycle.name}
                          </p>
                        </div>
                      </div>
                      <Badge color={reportStatus[r.status].color}>{reportStatus[r.status].label}</Badge>
                    </div>
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-slate-500">
                        <span>Tiến độ: {done}/{total} mục</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} />
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-sm text-brand-600">
                      Mở báo cáo <ArrowRight className="h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
