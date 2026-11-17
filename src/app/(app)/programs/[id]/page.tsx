import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderArchive, FileText, Target, ClipboardCheck, FileSpreadsheet, ListChecks } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { roleLabel, can } from "@/lib/rbac";
import { AutoSubmitSelect, ConfirmButton } from "@/components/form-controls";
import { createCycleAction, updateCycleStatusAction, createReportAction, createCourseAction, deleteCourseAction, cloneCycleAction } from "../actions";
import { getProgramStats } from "@/lib/metrics";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, LinkButton, Th, Td, Input, Select, Button } from "@/components/ui";
import { StatCard, DescItem } from "@/components/widgets";
import { degreeLevel, programVersionStatus, cycleStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { canAccessProgram } from "@/lib/access";
import { setProgramFacultyAction } from "../../admin/org/actions";

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canProgram = can(user.role, "program:write");
  const canCycle = canProgram || can(user.role, "report:write");
  const canReport = can(user.role, "report:write");
  const canCourse = canProgram || can(user.role, "outcome:write");

  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      faculty: true,
      versions: { orderBy: { year: "desc" } },
      courses: { orderBy: { semester: "asc" }, include: { _count: { select: { clos: true } } } },
      plos: { orderBy: { code: "asc" } },
      cycles: {
        orderBy: [{ year: "desc" }, { createdAt: "desc" }],
        include: { standardSet: true, reports: { select: { id: true, title: true }, orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!program || !(await canAccessProgram(user, program.id))) notFound();

  const [stats, teamRoles, standardSets] = await Promise.all([
    getProgramStats(program.id),
    prisma.userProgramRole.findMany({
      where: { programId: id },
      include: { user: { select: { fullName: true } } },
      orderBy: { role: "asc" },
    }),
    prisma.accreditationStandardSet.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const canOrg = can(user.role, "admin:users");
  const allFaculties = canOrg ? await prisma.faculty.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  const thisYear = new Date().getFullYear();

  return (
    <div>
      <PageHeader
        title={`${program.code} — ${program.nameVi}`}
        description={`${program.faculty.name} · ${degreeLevel[program.degreeLevel]}${program.totalCredits ? ` · ${program.totalCredits} tín chỉ` : ""}`}
        actions={
          <div className="flex gap-2">
            {canCourse && (
              <LinkButton href={`/programs/${program.id}/import`} variant="outline">
                <FileSpreadsheet className="h-4 w-4" /> Nhập Excel/Word
              </LinkButton>
            )}
            <LinkButton href={`/programs/${program.id}/facts`} variant="outline">
              <ListChecks className="h-4 w-4" /> Số liệu chính
            </LinkButton>
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
              <DescItem label="Khoa / viện quản lý">
                {canOrg ? (
                  <form action={setProgramFacultyAction.bind(null, program.id)}>
                    <AutoSubmitSelect name="facultyId" defaultValue={program.facultyId}>
                      {allFaculties.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  </form>
                ) : (
                  program.faculty.name
                )}
              </DescItem>
              <DescItem label="Mục tiêu đào tạo"><span className="whitespace-pre-line">{program.objectives ?? "—"}</span></DescItem>
              <DescItem label="Mô tả"><span className="whitespace-pre-line">{program.description ?? "—"}</span></DescItem>
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
                  {canProgram && <Th />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {program.courses.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium">
                      <Link href={`/syllabi/${c.id}`} className="text-brand-700 hover:underline">
                        {c.code}
                      </Link>
                    </Td>
                    <Td>{c.nameVi}</Td>
                    <Td>{c.credits}</Td>
                    <Td>{c.semester ?? "—"}</Td>
                    <Td>{c._count.clos}</Td>
                    {canProgram && (
                      <Td>
                        <form action={deleteCourseAction.bind(null, c.id)}>
                          <ConfirmButton message={`Xóa học phần ${c.code} cùng CLO, đề cương và liên kết ma trận của nó?`}>Xóa</ConfirmButton>
                        </form>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {canCourse && (
              <form
                action={createCourseAction.bind(null, program.id)}
                className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3"
              >
                <Input name="code" placeholder="Mã HP" className="w-24" required />
                <Input name="nameVi" placeholder="Tên học phần" className="min-w-48 flex-1" required />
                <Input name="credits" type="number" min={1} max={20} placeholder="TC" className="w-16" />
                <Input name="semester" type="number" min={1} max={12} placeholder="HK" className="w-16" />
                <Button type="submit" size="sm">
                  Thêm học phần
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Chuẩn đầu ra ({program.plos.length})</CardTitle>
              <Link href={`/outcomes?program=${program.id}`} className="text-sm text-brand-600 hover:underline">
                Quản lý PLO & ma trận
              </Link>
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
                <div key={c.id} className="space-y-2 rounded-lg border border-slate-100 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-800">{c.name}</div>
                      <div className="text-xs text-slate-500">
                        {c.standardSet.name} · Mục tiêu: {formatDate(c.targetDate)}
                      </div>
                    </div>
                    {canCycle ? (
                      <form action={updateCycleStatusAction.bind(null, c.id)}>
                        <AutoSubmitSelect name="status" defaultValue={c.status} aria-label="Trạng thái chu kỳ">
                          {Object.entries(cycleStatus).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.label}
                            </option>
                          ))}
                        </AutoSubmitSelect>
                      </form>
                    ) : (
                      <Badge color={cycleStatus[c.status].color}>{cycleStatus[c.status].label}</Badge>
                    )}
                  </div>
                  {c.reports.map((r) => (
                    <Link key={r.id} href={`/reports/${r.id}`} className="flex items-center gap-1.5 text-xs text-brand-700 hover:underline">
                      <FileText className="h-3.5 w-3.5" /> {r.title}
                    </Link>
                  ))}
                  {canCycle && c.reports.length > 0 && (
                    <details className="pt-1 text-xs">
                      <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Sao chép sang chu kỳ mới…</summary>
                      <form action={cloneCycleAction.bind(null, c.id)} className="mt-2 flex flex-wrap items-center gap-2">
                        <Input name="name" placeholder="Tên chu kỳ mới" className="h-8 w-64 text-xs" />
                        <Input name="year" type="number" defaultValue={c.year + 1} className="h-8 w-24 text-xs" />
                        <label className="flex items-center gap-1"><input type="checkbox" name="copyText" /> Giữ nội dung SAR làm bản nháp</label>
                        <label className="flex items-center gap-1"><input type="checkbox" name="copyAssign" defaultChecked /> Giữ phân công</label>
                        <Button type="submit" size="sm" variant="outline">Tạo chu kỳ mới</Button>
                      </form>
                    </details>
                  )}
                  {canReport && c.reports.length === 0 && (
                    <form action={createReportAction.bind(null, c.id)} className="flex flex-wrap items-center gap-2 pt-1">
                      <Select name="granularity" defaultValue="criterion" className="h-8 w-auto text-xs">
                        <option value="criterion">Mỗi tiêu chí một mục</option>
                        <option value="standard">Mỗi tiêu chuẩn một mục</option>
                      </Select>
                      <Button type="submit" size="sm">
                        <FileText className="h-3.5 w-3.5" /> Tạo báo cáo tự đánh giá
                      </Button>
                    </form>
                  )}
                </div>
              ))}
              {canCycle && (
                <form action={createCycleAction.bind(null, program.id)} className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tạo chu kỳ / đợt tự đánh giá</div>
                  <Select name="standardSetId" required defaultValue="">
                    <option value="" disabled>
                      — Chọn bộ tiêu chuẩn —
                    </option>
                    {standardSets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Input name="name" placeholder="Tên chu kỳ (để trống sẽ tự đặt)" />
                  <div className="grid grid-cols-3 gap-2">
                    <Input name="year" type="number" defaultValue={thisYear} aria-label="Năm" />
                    <Input name="startDate" type="date" aria-label="Ngày bắt đầu" title="Ngày bắt đầu" />
                    <Input name="targetDate" type="date" aria-label="Hạn hoàn thành" title="Hạn hoàn thành" />
                  </div>
                  <Button type="submit" size="sm">
                    Tạo chu kỳ
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Phân công vai trò</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {teamRoles.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa phân công vai trò theo chương trình (cấu hình tại Quản trị người dùng).</p>
              ) : (
                teamRoles.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{t.user.fullName}</span>
                    <Badge color="blue">{roleLabel(t.role)}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
