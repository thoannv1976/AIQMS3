import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderArchive, FileText, Target, BookOpen, ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProgramStats } from "@/lib/metrics";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, LinkButton, Th, Td } from "@/components/ui";
import { StatCard, Progress, DescItem } from "@/components/widgets";
import { degreeLevel, programVersionStatus, cycleStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      faculty: true,
      versions: { orderBy: { year: "desc" } },
      courses: { orderBy: { semester: "asc" }, include: { _count: { select: { clos: true } } } },
      plos: { orderBy: { code: "asc" } },
      cycles: { orderBy: { year: "desc" }, include: { standardSet: true } },
    },
  });
  if (!program) notFound();

  const stats = await getProgramStats(program.id);

  return (
    <div>
      <PageHeader
        title={`${program.code} — ${program.nameVi}`}
        description={`${program.faculty.name} · ${degreeLevel[program.degreeLevel]}${program.totalCredits ? ` · ${program.totalCredits} tín chỉ` : ""}`}
        actions={
          <div className="flex gap-2">
            <LinkButton href={`/outcomes?program=${program.id}`} variant="outline">
              <Target className="h-4 w-4" /> Chuẩn đầu ra
            </LinkButton>
            <LinkButton href={`/evidence?program=${program.id}`} variant="outline">
              <FolderArchive className="h-4 w-4" /> Minh chứng
            </LinkButton>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sẵn sàng kiểm định" value={`${stats.readiness}%`} icon={<ClipboardCheck className="h-5 w-5" />} />
        <StatCard label="Minh chứng" value={stats.evidenceCount} icon={<FolderArchive className="h-5 w-5" />} accent="green" />
        <StatCard label="Báo cáo TĐG" value={`${stats.reportProgress}%`} icon={<FileText className="h-5 w-5" />} accent="purple" />
        <StatCard label="Việc quá hạn" value={stats.overdueTasks} accent={stats.overdueTasks ? "red" : "green"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thông tin chung</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-slate-100">
              <DescItem label="Mục tiêu đào tạo">{program.objectives ?? "—"}</DescItem>
              <DescItem label="Mô tả">{program.description ?? "—"}</DescItem>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phiên bản chương trình</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {program.versions.length === 0 && <p className="text-sm text-slate-500">Chưa có phiên bản.</p>}
            {program.versions.map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-800">Phiên bản {v.versionLabel}</div>
                  {v.summary && <div className="text-xs text-slate-500">{v.summary}</div>}
                </div>
                <Badge color={programVersionStatus[v.status].color}>{programVersionStatus[v.status].label}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Học phần ({program.courses.length})</CardTitle>
            <Link href={`/syllabi?program=${program.id}`} className="text-sm text-brand-600 hover:underline">
              Đề cương
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <Th>Mã</Th>
                  <Th>Tên học phần</Th>
                  <Th>TC</Th>
                  <Th>HK</Th>
                  <Th>CLO</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {program.courses.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium">{c.code}</Td>
                    <Td>{c.nameVi}</Td>
                    <Td>{c.credits}</Td>
                    <Td>{c.semester ?? "—"}</Td>
                    <Td>{c._count.clos}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Chuẩn đầu ra ({program.plos.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {program.plos.map((p) => (
                <div key={p.id} className="flex gap-2 text-sm">
                  <Badge color="blue">{p.code}</Badge>
                  <span className="text-slate-700">{p.description}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chu kỳ kiểm định</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {program.cycles.length === 0 && <p className="text-sm text-slate-500">Chưa có chu kỳ kiểm định.</p>}
              {program.cycles.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-slate-800">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.standardSet.name} · Mục tiêu: {formatDate(c.targetDate)}
                    </div>
                  </div>
                  <Badge color={cycleStatus[c.status].color}>{cycleStatus[c.status].label}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
