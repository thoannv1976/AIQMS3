import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveProgram } from "@/lib/program-context";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, EmptyState } from "@/components/ui";
import { contributionShort, contributionLevel } from "@/lib/labels";
import { GapPanel } from "./GapPanel";

export default async function OutcomesPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);

  const data = selected
    ? await prisma.program.findUnique({
        where: { id: selected.id },
        include: {
          plos: { orderBy: { code: "asc" } },
          courses: { orderBy: { semester: "asc" } },
          curriculumMaps: true,
        },
      })
    : null;

  const cellMap = new Map<string, string>();
  data?.curriculumMaps.forEach((m) => cellMap.set(`${m.courseId}:${m.ploId}`, m.level));

  return (
    <div>
      <PageHeader
        title="Chuẩn đầu ra & ma trận liên kết"
        description="Quản lý PLO/CLO và ma trận đóng góp học phần → PLO (mức Introduced / Reinforced / Mastered)"
        actions={<ProgramSwitcher programs={programs} selectedId={selected?.id} />}
      />

      {!data ? (
        <EmptyState title="Chưa có chương trình" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Chuẩn đầu ra chương trình (PLO)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.plos.map((p) => (
                  <div key={p.id} className="flex gap-2 text-sm">
                    <Badge color="blue">{p.code}</Badge>
                    <span className="text-slate-700">{p.description}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Chú giải mức đóng góp</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {Object.values(contributionLevel).map((c) => (
                  <div key={c.label} className="flex items-center gap-2">
                    <Badge color={c.color}>{c.label.split(" ")[0]}</Badge>
                    <span className="text-slate-600">{c.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <GapPanel programId={data.id} />

          <Card>
            <CardHeader>
              <CardTitle>Ma trận học phần → PLO</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Học phần
                      </th>
                      {data.plos.map((p) => (
                        <th key={p.id} className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500" title={p.description}>
                          {p.code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.courses.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-slate-800">
                          {c.code}
                          <span className="ml-1 font-normal text-slate-400">{c.nameVi}</span>
                        </td>
                        {data.plos.map((p) => {
                          const level = cellMap.get(`${c.id}:${p.id}`) as keyof typeof contributionShort | undefined;
                          return (
                            <td key={p.id} className="px-3 py-2.5 text-center">
                              {level ? (
                                <Badge color={contributionLevel[level].color}>{contributionShort[level]}</Badge>
                              ) : (
                                <span className="text-slate-200">·</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
