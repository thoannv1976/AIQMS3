import Link from "next/link";
import { FileSpreadsheet, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { resolveProgram, programRolesOf } from "@/lib/program-context";
import { canInProgram } from "@/lib/rbac";
import { evidenceVisibilityWhere } from "@/lib/access";
import { buildEvidenceMatrix } from "@/lib/evidence/matrix";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, CardContent, PageHeader, EmptyState, Badge } from "@/components/ui";
import { StatCard } from "@/components/widgets";

const CHIP: Record<string, string> = {
  approved: "bg-green-100 text-green-800 border-green-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200 line-through",
};

export default async function EvidenceMatrixPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);
  const data = selected ? await buildEvidenceMatrix(selected.id, await evidenceVisibilityWhere(user, selected.id)) : null;
  const canWrite = selected ? canInProgram(user.role, await programRolesOf(user.id, selected.id), "evidence:write") : false;

  return (
    <div>
      <PageHeader
        title="Ma trận tiêu chí × minh chứng"
        description={data ? `${data.cycle.name} · ${data.cycle.standardSet.name.split("—")[0].trim()}` : "Theo bộ tiêu chí của chu kỳ kiểm định hiện hành"}
        actions={
          <div className="flex items-center gap-2">
            <ProgramSwitcher programs={programs} selectedId={selected?.id} />
            {selected && canWrite && (
              <Link
                href={`/evidence/crosswalk?program=${selected.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeftRight className="h-4 w-4" /> Chuyển mã tiêu chuẩn
              </Link>
            )}
            {selected && data && (
              <a
                href={`/evidence/matrix/export?program=${selected.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-4 w-4" /> Xuất Excel
              </a>
            )}
          </div>
        }
      />
      {!selected || !data ? (
        <EmptyState title="Chưa có chu kỳ kiểm định" description="Tạo chu kỳ kiểm định cho chương trình để xem ma trận." />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Tiêu chí" value={data.summary.criteria} />
            <StatCard label="Tiêu chí có minh chứng" value={`${data.summary.withEvidence}/${data.summary.criteria}`} accent="green" />
            <StatCard label="Có minh chứng đã duyệt" value={`${data.summary.withApproved}/${data.summary.criteria}`} accent="purple" />
            <StatCard
              label="Tiêu chí điều kiện chưa có MC duyệt"
              value={data.summary.conditionMissing.length}
              accent={data.summary.conditionMissing.length ? "red" : "green"}
            />
          </div>
          {data.summary.conditionMissing.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Tiêu chí điều kiện chưa có minh chứng đã duyệt: <b>{data.summary.conditionMissing.join(", ")}</b> — một tiêu chuẩn chỉ đạt khi mọi tiêu chí điều kiện đều đạt.
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span className={`rounded border px-1.5 ${CHIP.approved}`}>Đã duyệt</span>
            <span className={`rounded border px-1.5 ${CHIP.pending}`}>Chưa duyệt</span>
            <span className={`rounded border px-1.5 ${CHIP.expired}`}>Hết hiệu lực</span>
            <Badge color="red">ĐK</Badge> <span>= tiêu chí điều kiện</span>
          </div>
          {data.standards.map((s) => (
            <Card key={s.code}>
              <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">
                Tiêu chuẩn {s.code}. {s.title}
              </div>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {s.rows.map((r) => (
                      <tr key={r.criterionId} className={r.evidence.length === 0 ? "bg-amber-50/30" : ""}>
                        <td className="w-20 whitespace-nowrap px-4 py-2 align-top font-medium text-slate-800">
                          {r.code} {r.condition && <Badge color="red">ĐK</Badge>}
                        </td>
                        <td className="px-2 py-2 align-top text-slate-600">
                          <div className="line-clamp-2" title={r.title}>
                            {r.title}
                          </div>
                        </td>
                        <td className="w-[45%] px-4 py-2 align-top">
                          {r.evidence.length === 0 ? (
                            <span className="text-xs text-amber-700">Chưa có minh chứng</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {r.evidence.map((e) => (
                                <Link key={e.id} href={`/evidence/${e.id}`} title={e.title} className={`rounded border px-1.5 py-0.5 text-xs ${CHIP[e.state]}`}>
                                  {e.code}
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
