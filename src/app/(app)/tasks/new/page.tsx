import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { resolveProgram } from "@/lib/program-context";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { TaskForm } from "./TaskForm";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "task:write")) redirect("/tasks");
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
    <div className="max-w-2xl">
      <PageHeader title="Thêm nhiệm vụ" description={`Chương trình: ${selected.code}`} />
      <Card>
        <CardHeader>
          <CardTitle>Thông tin nhiệm vụ</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskForm programId={selected.id} criteria={criteria} />
        </CardContent>
      </Card>
    </div>
  );
}
