import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { resolveProgram, programRolesOf } from "@/lib/program-context";
import { PageHeader } from "@/components/ui";
import { BulkUploadForm } from "./BulkUploadForm";

export default async function BulkEvidencePage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { selected } = await resolveProgram(sp.program);
  if (!selected) redirect("/programs");
  if (!canInProgram(user.role, await programRolesOf(user.id, selected.id), "evidence:write")) redirect("/evidence");

  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId: selected.id },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    include: { standardSet: { include: { standards: { orderBy: { order: "asc" }, include: { criteria: { orderBy: { order: "asc" } } } } } } },
  });
  const criteria = cycle ? cycle.standardSet.standards.flatMap((s) => s.criteria).map((c) => ({ id: c.id, code: c.code, title: c.title })) : [];
  const existingCodes = (await prisma.evidence.findMany({ where: { programId: selected.id }, select: { code: true } })).map((e) => e.code);

  return (
    <div>
      <PageHeader
        title="Tải minh chứng hàng loạt"
        description={`Chương trình: ${selected.code} — ${selected.nameVi}${cycle ? ` · Bộ tiêu chí: ${cycle.standardSet.name.split("—")[0].trim()}` : ""}`}
      />
      <BulkUploadForm programId={selected.id} criteria={criteria} existingCodes={existingCodes} />
    </div>
  );
}
