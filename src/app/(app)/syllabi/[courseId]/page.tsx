import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, EmptyState } from "@/components/ui";
import { DescItem } from "@/components/widgets";
import { syllabusStatus, contributionLevel } from "@/lib/labels";

export default async function SyllabusDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  await requireUser();

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      program: true,
      clos: { orderBy: { code: "asc" } },
      syllabi: { orderBy: { createdAt: "desc" }, take: 1 },
      curriculumMaps: { include: { plo: true } },
    },
  });
  if (!course) notFound();
  const syl = course.syllabi[0];

  return (
    <div>
      <PageHeader
        title={`${course.code} — ${course.nameVi}`}
        description={`${course.program.code} · ${course.credits} tín chỉ · Học kỳ ${course.semester ?? "—"}`}
        actions={syl && <Badge color={syllabusStatus[syl.status].color}>{syllabusStatus[syl.status].label}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Đề cương học phần</CardTitle>
            </CardHeader>
            <CardContent>
              {syl ? (
                <dl className="divide-y divide-slate-100">
                  <DescItem label="Mục tiêu">{syl.objectives ?? "—"}</DescItem>
                  <DescItem label="Nội dung">{syl.content ?? "—"}</DescItem>
                  <DescItem label="Phương pháp giảng dạy">{syl.teachingMethods ?? "—"}</DescItem>
                  <DescItem label="Phương pháp đánh giá">{syl.assessmentMethods ?? "—"}</DescItem>
                  <DescItem label="Tài liệu học tập">{syl.materials ?? "—"}</DescItem>
                </dl>
              ) : (
                <EmptyState title="Chưa có đề cương" description="Học phần này chưa có đề cương được tải lên." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chuẩn đầu ra học phần (CLO)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {course.clos.length === 0 && <p className="text-sm text-slate-500">Chưa có CLO.</p>}
              {course.clos.map((c) => (
                <div key={c.id} className="flex gap-2 text-sm">
                  <Badge color="cyan">{c.code}</Badge>
                  <span className="text-slate-700">{c.description}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Đóng góp vào PLO</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {course.curriculumMaps.length === 0 && <p className="text-sm text-slate-500">Chưa liên kết PLO.</p>}
            {course.curriculumMaps.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{m.plo.code}</span>
                <Badge color={contributionLevel[m.level].color}>{contributionLevel[m.level].label}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
