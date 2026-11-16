import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { canAccessProgram } from "@/lib/access";
import { programRolesOf } from "@/lib/program-context";
import { PageHeader } from "@/components/ui";
import { StructureImportForm } from "./StructureImportForm";

export const dynamic = "force-dynamic";

export default async function StructureImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const program = await prisma.program.findUnique({ where: { id }, select: { id: true, code: true, nameVi: true } });
  if (!program || !(await canAccessProgram(user, id))) notFound();
  const roles = await programRolesOf(user.id, id);
  if (!canInProgram(user.role, roles, "outcome:write") && !canInProgram(user.role, roles, "program:write")) redirect(`/programs/${id}`);
  return (
    <div>
      <PageHeader
        title="Nhập cấu trúc chương trình từ Excel"
        description={`${program.code} — ${program.nameVi} · Học phần, PLO, ma trận học phần–PLO (I/R/M) và CLO`}
      />
      <StructureImportForm programId={program.id} programCode={program.code} />
    </div>
  );
}
