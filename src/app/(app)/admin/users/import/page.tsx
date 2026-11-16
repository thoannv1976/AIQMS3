import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { UserImportForm } from "./UserImportForm";

export const dynamic = "force-dynamic";

export default async function UserImportPage() {
  const user = await requireUser();
  if (!can(user.role, "admin:users")) redirect("/dashboard");
  const programs = await prisma.program.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, nameVi: true } });
  return (
    <div>
      <PageHeader title="Nhập tài khoản hàng loạt" description="Tạo/cập nhật tài khoản từ Excel, gán bộ môn và vai trò theo chương trình, cấp mật khẩu tạm" />
      <UserImportForm programs={programs} />
    </div>
  );
}
