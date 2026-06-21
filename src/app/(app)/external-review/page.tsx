import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { resolveProgram } from "@/lib/program-context";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, EmptyState } from "@/components/ui";
import { StatCard } from "@/components/widgets";
import { PdcaStatus } from "@/generated/prisma/enums";
import { NewRecommendationForm } from "./NewRecommendationForm";
import { RecommendationCard } from "./RecommendationCard";

export const dynamic = "force-dynamic";

export default async function ExternalReviewPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);
  const canWrite = can(user.role, "improvement:write");

  const cycle = selected
    ? await prisma.accreditationCycle.findFirst({
        where: { programId: selected.id },
        orderBy: { year: "desc" },
        include: {
          standardSet: {
            include: { standards: { orderBy: { order: "asc" }, include: { criteria: { orderBy: { order: "asc" } } } } },
          },
          recommendations: {
            orderBy: { createdAt: "desc" },
            include: { criterion: { select: { code: true, title: true } } },
          },
        },
      })
    : null;

  const criteria = cycle ? cycle.standardSet.standards.flatMap((s) => s.criteria).map((c) => ({ id: c.id, code: c.code, title: c.title })) : [];
  const recs = cycle?.recommendations ?? [];
  const responded = recs.filter((r) => r.respondedAt).length;
  const completed = recs.filter((r) => r.status === PdcaStatus.COMPLETED).length;

  return (
    <div>
      <PageHeader
        title="Đánh giá ngoài & giải trình"
        description="Quản lý khuyến nghị của đoàn đánh giá ngoài, soạn giải trình và theo dõi hành động khắc phục."
        actions={<ProgramSwitcher programs={programs} selectedId={selected?.id} />}
      />

      {!selected ? (
        <EmptyState title="Chưa có chương trình" />
      ) : !cycle ? (
        <EmptyState title="Chưa có chu kỳ kiểm định" description="Tạo chu kỳ kiểm định để ghi nhận khuyến nghị đánh giá ngoài." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Tổng khuyến nghị" value={recs.length} />
            <StatCard label="Đã giải trình" value={`${responded}/${recs.length}`} accent={responded === recs.length && recs.length > 0 ? "green" : "amber"} />
            <StatCard label="Đã khắc phục xong" value={`${completed}/${recs.length}`} accent="green" />
          </div>

          {canWrite && (
            <Card>
              <CardHeader>
                <CardTitle>Ghi nhận khuyến nghị mới</CardTitle>
              </CardHeader>
              <CardContent>
                <NewRecommendationForm programId={selected.id} criteria={criteria} />
              </CardContent>
            </Card>
          )}

          {recs.length === 0 ? (
            <EmptyState title="Chưa có khuyến nghị nào" description="Ghi nhận khuyến nghị từ báo cáo của đoàn đánh giá ngoài." />
          ) : (
            <div className="space-y-4">
              {recs.map((r) => (
                <RecommendationCard
                  key={r.id}
                  canWrite={canWrite}
                  rec={{
                    id: r.id,
                    content: r.content,
                    assessor: r.assessor,
                    criterion: r.criterion,
                    priority: r.priority,
                    status: r.status,
                    responsibleUnit: r.responsibleUnit,
                    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
                    response: r.response,
                    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
