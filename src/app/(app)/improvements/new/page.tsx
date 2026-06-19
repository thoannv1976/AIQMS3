import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { resolveProgram } from "@/lib/program-context";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { ImprovementForm } from "./ImprovementForm";

export default async function NewImprovementPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "improvement:write")) redirect("/improvements");
  const sp = await searchParams;
  const { selected } = await resolveProgram(sp.program);
  if (!selected) redirect("/programs");

  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId: selected.id },
    orderBy: { year: "desc" },
    include: { standardSet: { include: { standards: { orderBy: { order: "asc" }, include: { criteria: { orderBy: { order: "asc" } } } } } } },
  });
  const criteria = cycle ? cycle.standardSet.standards.flatMap((s) => s.criteria).map((c) => ({ id: c.id, code: c.code, title: c.title })) : [];

  return (
    <div className="max-w-3xl">
      <PageHeader title="Thêm kế hoạch cải tiến" description={`Chương trình: ${selected.code}`} />
      <Card>
        <CardHeader>
          <CardTitle>Thông tin cải tiến (PDCA)</CardTitle>
        </CardHeader>
        <CardContent>
          <ImprovementForm programId={selected.id} criteria={criteria} />
        </CardContent>
      </Card>
    </div>
  );
}
