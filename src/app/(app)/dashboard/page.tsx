import Link from "next/link";
import { GraduationCap, FolderArchive, AlertTriangle, ClipboardCheck, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProgramStats, getCriteriaGaps } from "@/lib/metrics";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader } from "@/components/ui";
import { StatCard, Progress } from "@/components/widgets";
import { PieChartCard } from "@/components/charts";
import { evidenceStatus as evStatusMeta, cycleStatus as cycleMeta } from "@/lib/labels";
import { roleLabel } from "@/lib/rbac";
import { formatDateTime } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireUser();

  const [programs, evidenceGroups, openCycles, overdueTasks, recentAudit] = await Promise.all([
    prisma.program.findMany({ include: { faculty: true }, orderBy: { createdAt: "asc" } }),
    prisma.evidence.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.accreditationCycle.count({ where: { status: { notIn: ["CLOSED"] } } }),
    prisma.task.count({ where: { status: { not: "DONE" }, dueDate: { lt: new Date() } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true } }),
  ]);

  const programStats = await Promise.all(
    programs.map(async (p) => ({ program: p, stats: await getProgramStats(p.id) })),
  );

  const totalEvidence = evidenceGroups.reduce((s, g) => s + g._count._all, 0);
  const pieData = evidenceGroups.map((g) => ({
    name: evStatusMeta[g.status].label,
    value: g._count._all,
  }));

  // Risk map for the program with the lowest readiness.
  const lowest = [...programStats].sort((a, b) => a.stats.readiness - b.stats.readiness)[0];
  const gaps = lowest ? await getCriteriaGaps(lowest.program.id) : [];

  const avgReadiness = programStats.length
    ? Math.round(programStats.reduce((s, p) => s + p.stats.readiness, 0) / programStats.length)
    : 0;

  return (
    <div>
      <PageHeader
        title={`Xin chào, ${user.fullName.split(" ").slice(-1)[0]}`}
        description={`${roleLabel(user.role)} · Tổng quan chất lượng & tiến độ kiểm định`}
      />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Chương trình đào tạo" value={programs.length} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Chu kỳ kiểm định đang mở" value={openCycles} icon={<ClipboardCheck className="h-5 w-5" />} accent="purple" />
        <StatCard label="Minh chứng" value={totalEvidence} icon={<FolderArchive className="h-5 w-5" />} accent="green" />
        <StatCard
          label="Nhiệm vụ quá hạn"
          value={overdueTasks}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent={overdueTasks > 0 ? "red" : "green"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Readiness per program */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Mức độ sẵn sàng kiểm định theo chương trình</CardTitle>
            <Badge color="blue">TB {avgReadiness}%</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {programStats.length === 0 && <p className="text-sm text-slate-500">Chưa có chương trình nào.</p>}
            {programStats.map(({ program, stats }) => (
              <Link key={program.id} href={`/programs/${program.id}`} className="block rounded-lg p-2 hover:bg-slate-50">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-800">
                    {program.code} — {program.nameVi}
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{stats.readiness}%</span>
                </div>
                <Progress value={stats.readiness} />
                <div className="mt-1 flex gap-4 text-xs text-slate-400">
                  <span>{stats.coveredCriteria}/{stats.totalCriteria} tiêu chí có minh chứng</span>
                  <span>Báo cáo TĐG: {stats.reportProgress}%</span>
                  {stats.overdueTasks > 0 && <span className="text-red-500">{stats.overdueTasks} việc quá hạn</span>}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Evidence distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Phân bố trạng thái minh chứng</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length ? <PieChartCard data={pieData} /> : <p className="text-sm text-slate-500">Chưa có minh chứng.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Risk map */}
        <Card>
          <CardHeader>
            <CardTitle>Bản đồ rủi ro — tiêu chí thiếu minh chứng</CardTitle>
          </CardHeader>
          <CardContent>
            {lowest && (
              <p className="mb-3 text-xs text-slate-500">
                Chương trình rủi ro cao nhất: <span className="font-medium text-slate-700">{lowest.program.code}</span> ({lowest.stats.readiness}% sẵn sàng)
              </p>
            )}
            {gaps.length ? (
              <ul className="space-y-2">
                {gaps.map((g) => (
                  <li key={g.code} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <span>
                      <span className="font-medium text-slate-700">{g.code}</span> — {g.title}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Không phát hiện tiêu chí thiếu minh chứng.</p>
            )}
          </CardContent>
        </Card>

        {/* AI auto-brief */}
        <Card>
          <CardHeader>
            <CardTitle>Nhận định nhanh cho lãnh đạo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="prose-ai text-slate-700">
              {programStats.length
                ? `Hệ thống đang theo dõi ${programs.length} chương trình với mức sẵn sàng trung bình ${avgReadiness}%. ` +
                  (overdueTasks > 0 ? `Có ${overdueTasks} nhiệm vụ quá hạn cần xử lý. ` : "Không có nhiệm vụ quá hạn. ") +
                  (lowest && lowest.stats.readiness < 70
                    ? `Cần ưu tiên chương trình ${lowest.program.code} (${lowest.stats.readiness}%), tập trung bổ sung minh chứng cho ${gaps.length} tiêu chí còn trống.`
                    : "Tiến độ tổng thể ở mức khá.")
                : "Chưa có dữ liệu chương trình để phân tích."}
            </p>
            <Link href="/ai-assistant" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
              Hỏi trợ lý AI <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Hoạt động gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAudit.length ? (
            <ul className="divide-y divide-slate-100">
              {recentAudit.map((log) => (
                <li key={log.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">
                    <span className="font-medium">{log.user?.fullName ?? "Hệ thống"}</span>{" "}
                    <span className="text-slate-500">{log.action}</span> · {log.entityType}
                  </span>
                  <span className="text-xs text-slate-400">{formatDateTime(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Chưa có hoạt động nào được ghi nhận.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
