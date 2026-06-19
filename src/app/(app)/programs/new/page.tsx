import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { ProgramForm } from "./ProgramForm";

export default async function NewProgramPage() {
  const user = await requireUser();
  if (!can(user.role, "program:write")) redirect("/programs");

  const faculties = await prisma.faculty.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <div className="max-w-2xl">
      <PageHeader title="Thêm chương trình đào tạo" description="Khởi tạo thông tin nền của một CTĐT mới" />
      <Card>
        <CardHeader>
          <CardTitle>Thông tin chương trình</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgramForm faculties={faculties} />
        </CardContent>
      </Card>
    </div>
  );
}
