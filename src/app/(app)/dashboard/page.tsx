import Link from "next/link";
import { GraduationCap, FolderArchive, AlertTriangle, ClipboardCheck, ArrowRight, FileDown, Printer, CalendarX } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCriteriaGaps } from "@/lib/metrics";
import { allowedProgramIds } from "@/lib/access";
import { getManagementOverview } from "@/lib/quality/management";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, Select, Button, Th, Td } from "@/components/ui";
import { StatCard, Progress } from "@/components/widgets";
import { PieChartCard } from "@/components/charts";
import { can, roleLabel } from "@/lib/rbac";
import { formatDateTime } from "@/lib/utils";
import { BriefPanel } from "./BriefPanel";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ faculty?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const scope = await allowedProgramIds(user);
  const facultyId = sp.faculty || null;

  const [overview, faculties, recentAudit, latestBrief] = await Promise.all([
    getManagementOverview({ programIds: scope, facultyId }),
    prisma.faculty.findMany({
      where: scope ? { programs: { some: { id: { in: scope } } } } : { programs: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    can(user.role, "audit:view") ? prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true } }) : Promise.resolve([]),
    prisma.aiAnalysisResult.findFirst({ where: { type: "LEADERSHIP_BRIEF", targetType: "dashboard", targetId: facultyId ?? "all" }, orderBy: { createdAt: "desc" } }),
  ]);

  const programStats = overview.programs;
  const pieData = overview.evidenceByStatus.map((g) => ({ name: g.label, value: g.count }));
  const lowest = [...programStats].sort((a, b) => a.stats.readiness - b.stats.readiness)[0];
  const gaps = lowest ? await getCriteriaGaps(lowest.id) : [];
  const exportQs = facultyId ? `&faculty=${facultyId}` : "";

  return (
    <div>
      <PageHeader
        title={`Xin chào, ${user.fullName.split(" ").slice(-1)[0]}`}
        description={`${roleLabel(user.role)} · Tổng quan chất lượng & tiến độ kiểm định · Phạm vi: ${overview.scopeLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {faculties.length > 1 && (
              <form className="flex items-center gap-2" action="/dashboard">
                <Select name="faculty" defaultValue={facultyId ?? ""} className="w-auto">
                  <option value="">Toàn trường</option>
                  {faculties.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="sm" variant="outline">
                  Lọc
                </Button>
              </form>
            )}
            <a
              href={`/dashboard/export?format=doc${exportQs}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4" /> Báo cáo quản trị (Word)
            </a>
            <a
              href={`/dashboard/export?format=pdf${exportQs}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" /> PDF
            </a>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Chương trình đào tạo" value={programStats.length} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Chu kỳ kiểm định đang mở" value={overview.openCycles} icon={<ClipboardCheck className="h-5 w-5" />} accent="purple" />
        <StatCard label="Minh chứng" value={overview.totalEvidence} icon={<FolderArchive className="h-5 w-5" />} accent="green" />
        <StatCard
          label="MC hết / sắp hết hiệu lực"
          value={`${overview.expired} / ${overview.expiring}`}
          icon={<CalendarX className="h-5 w-5" />}
          accent={overview.expired > 0 ? "red" : overview.expiring > 0 ? "amber" : "green"}
        />
        <StatCard
          label="Nhiệm vụ quá hạn"
          value={overview.overdueTasks}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent={overview.overdueTasks > 0 ? "red" : "green"}
        />
      </div>

      <div className="mt-6">
        <BriefPanel
          facultyId={facultyId}
          canUseAi={can(user.role, "ai:use")}
          latest={latestBrief?.result ? { text: latestBrief.result, createdAt: latestBrief.createdAt.toISOString() } : null}
        />
      </div>

      {!facultyId && overview.faculties.length > 1 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Tổng hợp theo khoa</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <Th>Khoa / Viện</Th>
                  <Th>Số CTĐT</Th>
                  <Th>Sẵn sàng TB</Th>
                  <Th>MC chờ duyệt</Th>
                  <Th>Việc quá hạn</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.faculties.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/dashboard?faculty=${f.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                        {f.name}
                      </Link>
                    </Td>
                    <Td>{f.programs}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Progress value={f.avgReadiness} className="w-24" /> {f.avgReadiness}%
                      </div>
                    </Td>
                    <Td>{f.pendingEvidence}</Td>
                    <Td className={f.overdueTasks ? "text-red-600" : ""}>{f.overdueTasks}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Readiness per program */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Mức độ sẵn sàng kiểm định theo chương trình</CardTitle>
            <Badge color="blue">TB {overview.avgReadiness}%</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {programStats.length === 0 && <p className="text-sm text-slate-500">Chưa có chương trình nào.</p>}
            {programStats.map((p) => (
              <Link key={p.id} href={`/programs/${p.id}`} className="block rounded-lg p-2 hover:bg-slate-50">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-800">
                    {p.code} — {p.name}
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{p.stats.readiness}%</span>
                </div>
                <Progress value={p.stats.readiness} />
                <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-400">
                  <span>{p.stats.coveredCriteria}/{p.stats.totalCriteria} tiêu chí có minh chứng</span>
                  <span>Báo cáo TĐG: {p.stats.reportProgress}%</span>
                  {p.standardSet && <span>{p.standardSet}</span>}
                  {p.stats.overdueTasks > 0 && <span className="text-red-500">{p.stats.overdueTasks} việc quá hạn</span>}
                  {p.conditionMissing.length > 0 && <span className="text-red-500">ĐK thiếu: {p.conditionMissing.join(", ")}</span>}
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
                Chương trình rủi ro cao nhất: <span className="font-medium text-slate-700">{lowest.code}</span> ({lowest.stats.readiness}% sẵn sàng)
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

        {/* Activity summary */}
        <Card>
          <CardHeader>
            <CardTitle>Hoạt động 30 ngày & cải tiến</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <div className="flex justify-between">
              <span>Minh chứng tải lên</span>
              <b>{overview.last30.evidenceUploaded}</b>
            </div>
            <div className="flex justify-between">
              <span>Minh chứng được duyệt</span>
              <b>{overview.last30.evidenceApproved}</b>
            </div>
            <div className="flex justify-between">
              <span>Lần cập nhật mục báo cáo TĐG</span>
              <b>{overview.last30.sectionsSaved}</b>
            </div>
            <div className="flex justify-between">
              <span>Kế hoạch cải tiến hoàn thành</span>
              <b>
                {overview.pdca.completed}/{overview.pdca.total}
              </b>
            </div>
            <Link href="/ai-assistant" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
              Hỏi trợ lý AI <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {recentAudit.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Hoạt động gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100">
              {recentAudit.map((log) => (
                <li key={log.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">
                    <span className="font-medium">{log.user?.fullName ?? "Hệ thống"}</span> <span className="text-slate-500">{log.action}</span> · {log.entityType}
                  </span>
                  <span className="text-xs text-slate-400">{formatDateTime(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
