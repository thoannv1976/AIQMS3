import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { canAccessProgram } from "@/lib/access";
import { programRolesOf } from "@/lib/program-context";
import { PageHeader } from "@/components/ui";
import { ObeImportForm } from "./ObeImportForm";

export const dynamic = "force-dynamic";

export default async function ObeImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const program = await prisma.program.findUnique({ where: { id }, select: { id: true, code: true, nameVi: true } });
  if (!program || !(await canAccessProgram(user, id))) notFound();
  if (!canInProgram(user.role, await programRolesOf(user.id, id), "obe:write")) redirect(`/obe?program=${id}`);
  return (
    <div>
      <PageHeader
        title="Nhập kết quả đạt chuẩn đầu ra (OBE) từ Excel"
        description={`${program.code} — ${program.nameVi} · Tỷ lệ người học đạt PLO/CLO theo kỳ đo hoặc khóa tốt nghiệp`}
      />
      <ObeImportForm programId={program.id} programCode={program.code} />
    </div>
  );
}
