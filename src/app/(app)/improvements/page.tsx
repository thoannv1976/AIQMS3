import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { resolveProgram } from "@/lib/program-context";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, CardContent, LinkButton, PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { PdcaSelect } from "./PdcaSelect";

export default async function ImprovementsPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);
  const canWrite = can(user.role, "improvement:write");

  const plans = selected
    ? await prisma.improvementPlan.findMany({
        where: { programId: selected.id },
        include: { criterion: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Kế hoạch cải tiến chất lượng (PDCA)"
        description="Theo dõi cải tiến liên tục: Plan → Do → Check → Act, gắn minh chứng trước/sau cải tiến"
        actions={
          <div className="flex items-center gap-3">
            <ProgramSwitcher programs={programs} selectedId={selected?.id} />
            {selected && canWrite && (
              <LinkButton href={`/improvements/new?program=${selected.id}`}>
                <Plus className="h-4 w-4" /> Thêm kế hoạch
              </LinkButton>
            )}
          </div>
        }
      />

      {!selected ? (
        <EmptyState title="Chưa có chương trình" />
      ) : plans.length === 0 ? (
        <EmptyState title="Chưa có kế hoạch cải tiến" />
      ) : (
        <div className="space-y-4">
          {plans.map((p) => (
            <Card key={p.id}>
              <CardContent>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.criterion && <Badge color="slate">{p.criterion.code}</Badge>}
                      {p.source && <Badge color="blue">{p.source}</Badge>}
                      <h3 className="font-semibold text-slate-900">{p.problem}</h3>
                    </div>
                    <div className="mt-2 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      {p.rootCause && <p><span className="text-slate-400">Nguyên nhân: </span>{p.rootCause}</p>}
                      {p.action && <p><span className="text-slate-400">Hành động: </span>{p.action}</p>}
                      {p.responsibleUnit && <p><span className="text-slate-400">Phụ trách: </span>{p.responsibleUnit}</p>}
                      {p.kpi && <p><span className="text-slate-400">KPI: </span>{p.kpi}</p>}
                    </div>
                    {p.dueDate && <p className="mt-1 text-xs text-slate-400">Hạn: {formatDate(p.dueDate)}</p>}
                  </div>
                  <PdcaSelect id={p.id} status={p.status} disabled={!canWrite} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
