import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, roleLabel } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, Button, Th, Td, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { CreateUserForm } from "./CreateUserForm";
import { ProgramRoleForm } from "./ProgramRoleForm";
import { toggleUserActiveAction, removeProgramRoleAction } from "./actions";

export default async function AdminUsersPage() {
  const actor = await requireUser();
  if (!can(actor.role, "admin:users")) redirect("/dashboard");

  const [users, programs, programRoles] = await Promise.all([
    prisma.user.findMany({ include: { department: true }, orderBy: { createdAt: "asc" } }),
    prisma.program.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, code: true, nameVi: true } }),
    prisma.userProgramRole.findMany({
      include: { user: { select: { fullName: true } }, program: { select: { code: true } } },
      orderBy: { id: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Quản trị người dùng" description="Quản lý tài khoản, vai trò và phân quyền theo chức năng" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Danh sách người dùng ({users.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-100 bg-slate-50">
                    <tr>
                      <Th>Họ tên / Email</Th>
                      <Th>Vai trò</Th>
                      <Th>Trạng thái</Th>
                      <Th>Tạo lúc</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <Td>
                          <div className="font-medium text-slate-900">{u.fullName}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </Td>
                        <Td>
                          <Badge color="blue">{roleLabel(u.role)}</Badge>
                        </Td>
                        <Td>
                          <Badge color={u.isActive ? "green" : "red"}>{u.isActive ? "Hoạt động" : "Đã khóa"}</Badge>
                        </Td>
                        <Td className="text-xs text-slate-400">{formatDate(u.createdAt)}</Td>
                        <Td>
                          {u.id !== actor.id && (
                            <form action={toggleUserActiveAction.bind(null, u.id)}>
                              <Button type="submit" size="sm" variant="outline">
                                {u.isActive ? "Khóa" : "Mở khóa"}
                              </Button>
                            </form>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Thêm người dùng</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateUserForm />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Vai trò theo chương trình ({programRoles.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {programRoles.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title="Chưa gán vai trò theo chương trình"
                    description="Gán vai trò cho người dùng trong từng chương trình để giới hạn phạm vi truy cập và nâng quyền cục bộ."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-slate-100 bg-slate-50">
                      <tr>
                        <Th>Người dùng</Th>
                        <Th>Chương trình</Th>
                        <Th>Vai trò</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {programRoles.map((pr) => (
                        <tr key={pr.id} className="hover:bg-slate-50">
                          <Td className="font-medium text-slate-800">{pr.user.fullName}</Td>
                          <Td>
                            <Badge color="slate">{pr.program.code}</Badge>
                          </Td>
                          <Td>
                            <Badge color="blue">{roleLabel(pr.role)}</Badge>
                          </Td>
                          <Td>
                            <form action={removeProgramRoleAction.bind(null, pr.id)}>
                              <Button type="submit" size="sm" variant="outline">
                                Gỡ
                              </Button>
                            </form>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Gán vai trò theo chương trình</CardTitle>
          </CardHeader>
          <CardContent>
            <ProgramRoleForm users={users.map((u) => ({ id: u.id, fullName: u.fullName }))} programs={programs} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
