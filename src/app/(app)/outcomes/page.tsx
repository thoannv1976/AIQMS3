import Link from "next/link";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveProgram, programRolesOf } from "@/lib/program-context";
import { canInProgram } from "@/lib/rbac";
import { AutoSubmitSelect, ConfirmButton } from "@/components/form-controls";
import { createPloAction, updatePloAction, deletePloAction, setMatrixCellAction } from "./edit-actions";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, EmptyState, Input, Button, LinkButton } from "@/components/ui";
import { contributionShort, contributionLevel } from "@/lib/labels";
import { GapPanel } from "./GapPanel";

export default async function OutcomesPage({ searchParams }: { searchParams: Promise<{ program?: string; edit?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);
  const canWrite = selected
    ? canInProgram(user.role, await programRolesOf(user.id, selected.id), "outcome:write")
    : false;
  const editing = canWrite && sp.edit === "1";
  const baseHref = selected ? `/outcomes?program=${selected.id}` : "/outcomes";

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
        actions={
          <div className="flex items-center gap-2">
            {canWrite && selected && !editing && (
              <LinkButton href={`/programs/${selected.id}/import`} variant="outline">
                Nhập từ Excel
              </LinkButton>
            )}
            {canWrite &&
              (editing ? (
                <LinkButton href={baseHref}>Xong</LinkButton>
              ) : (
                <LinkButton href={`${baseHref}&edit=1`} variant="outline">
                  <Pencil className="h-4 w-4" /> Chỉnh sửa PLO & ma trận
                </LinkButton>
              ))}
            <ProgramSwitcher programs={programs} selectedId={selected?.id} />
          </div>
        }
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
                {data.plos.length === 0 && (
                  <p className="text-sm text-slate-500">
                    Chưa có PLO.{" "}
                    {canWrite && !editing && (
                      <Link href={`${baseHref}&edit=1`} className="text-brand-600 hover:underline">
                        Thêm PLO
                      </Link>
                    )}
                  </p>
                )}
                {data.plos.map((p) =>
                  editing ? (
                    <div key={p.id} className="flex flex-wrap items-center gap-2">
                      <form action={updatePloAction.bind(null, p.id)} className="flex flex-1 flex-wrap items-center gap-2">
                        <Input name="code" defaultValue={p.code} className="w-20" required />
                        <Input name="description" defaultValue={p.description} className="min-w-64 flex-1" required />
                        <Button type="submit" size="sm" variant="outline">
                          Lưu
                        </Button>
                      </form>
                      <form action={deletePloAction.bind(null, p.id)}>
                        <ConfirmButton message={`Xóa ${p.code}? Các liên kết ma trận và CLO–PLO của nó cũng bị xóa.`}>Xóa</ConfirmButton>
                      </form>
                    </div>
                  ) : (
                    <div key={p.id} className="flex gap-2 text-sm">
                      <Badge color="blue">{p.code}</Badge>
                      <span className="text-slate-700">{p.description}</span>
                    </div>
                  ),
                )}
                {editing && (
                  <form
                    action={createPloAction.bind(null, data.id)}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 p-2"
                  >
                    <Input name="code" placeholder={`PLO${data.plos.length + 1}`} className="w-20" required />
                    <Input name="description" placeholder="Phát biểu chuẩn đầu ra (đo lường được)" className="min-w-64 flex-1" required />
                    <Button type="submit" size="sm">
                      Thêm PLO
                    </Button>
                  </form>
                )}
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
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Ma trận học phần → PLO</CardTitle>
              {editing && <span className="text-xs text-slate-500">Chọn mức I / R / M cho từng ô — lưu ngay khi chọn.</span>}
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
                    {data.courses.length === 0 && (
                      <tr>
                        <td colSpan={data.plos.length + 1} className="px-4 py-4 text-sm text-slate-500">
                          Chương trình chưa có học phần —{" "}
                          <Link href={`/programs/${data.id}`} className="text-brand-600 hover:underline">
                            thêm học phần tại trang chương trình
                          </Link>
                          .
                        </td>
                      </tr>
                    )}
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
                              {editing ? (
                                <form action={setMatrixCellAction.bind(null, c.id, p.id)}>
                                  <AutoSubmitSelect name="level" defaultValue={level ?? ""} aria-label={`${c.code} → ${p.code}`} className="w-14 px-1">
                                    <option value="">·</option>
                                    <option value="INTRODUCED">I</option>
                                    <option value="REINFORCED">R</option>
                                    <option value="MASTERED">M</option>
                                  </AutoSubmitSelect>
                                </form>
                              ) : level ? (
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
