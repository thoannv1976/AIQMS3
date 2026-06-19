import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveProgram } from "@/lib/program-context";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, PageHeader, Badge, EmptyState, Th, Td } from "@/components/ui";
import { syllabusStatus } from "@/lib/labels";

export default async function SyllabiPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);

  const courses = selected
    ? await prisma.course.findMany({
        where: { programId: selected.id },
        include: { syllabi: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { clos: true } } },
        orderBy: { semester: "asc" },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Đề cương học phần"
        description="Quản lý đề cương, CLO, phương pháp giảng dạy và đánh giá theo mẫu thống nhất"
        actions={<ProgramSwitcher programs={programs} selectedId={selected?.id} />}
      />

      {!selected ? (
        <EmptyState title="Chưa có chương trình" />
      ) : courses.length === 0 ? (
        <EmptyState title="Chưa có học phần" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <Th>Mã</Th>
                  <Th>Tên học phần</Th>
                  <Th>Tín chỉ</Th>
                  <Th>HK</Th>
                  <Th>CLO</Th>
                  <Th>Đề cương</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courses.map((c) => {
                  const syl = c.syllabi[0];
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <Td className="font-medium">
                        <Link href={`/syllabi/${c.id}`} className="text-slate-900 hover:text-brand-600">
                          {c.code}
                        </Link>
                      </Td>
                      <Td>{c.nameVi}</Td>
                      <Td>{c.credits}</Td>
                      <Td>{c.semester ?? "—"}</Td>
                      <Td>{c._count.clos}</Td>
                      <Td>
                        {syl ? (
                          <Badge color={syllabusStatus[syl.status].color}>{syllabusStatus[syl.status].label}</Badge>
                        ) : (
                          <Badge color="red">Chưa có</Badge>
                        )}
                      </Td>
                      <Td>
                        <Link href={`/syllabi/${c.id}`} className="text-slate-400 hover:text-brand-600">
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
