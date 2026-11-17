import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { resolveProgram, programRolesOf } from "@/lib/program-context";
import { ProgramSwitcher } from "@/components/program-switcher";
import { PageHeader, EmptyState } from "@/components/ui";
import { BackLink } from "@/components/BackLink";
import { BulkSyllabusForm } from "./BulkSyllabusForm";

export const dynamic = "force-dynamic";

export default async function BulkSyllabusPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);
  if (selected && !canInProgram(user.role, await programRolesOf(user.id, selected.id), "syllabus:write")) redirect(`/syllabi?program=${selected.id}`);

  const courses = selected
    ? await prisma.course.findMany({
        where: { programId: selected.id },
        orderBy: [{ semester: "asc" }, { code: "asc" }],
        select: { id: true, code: true, nameVi: true, _count: { select: { syllabi: true } } },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Nhập nhiều đề cương học phần"
        description="Chọn nhiều tệp Word (.docx) — mỗi tệp được ghép với học phần theo mã trong tên tệp hoặc trong nội dung"
        actions={
          <>
            <BackLink href={selected ? `/syllabi?program=${selected.id}` : "/syllabi"}>Danh sách đề cương</BackLink>
            <ProgramSwitcher programs={programs} selectedId={selected?.id} />
          </>
        }
      />
      {!selected ? (
        <EmptyState title="Chưa có chương trình" />
      ) : courses.length === 0 ? (
        <EmptyState title="Chương trình chưa có học phần" description="Nhập danh sách học phần trước (Chương trình › Nhập Excel/Word)." />
      ) : (
        <BulkSyllabusForm
          key={selected.id}
          programId={selected.id}
          courses={courses.map((c) => ({ id: c.id, code: c.code, nameVi: c.nameVi, hasSyllabus: c._count.syllabi > 0 }))}
        />
      )}
    </div>
  );
}
