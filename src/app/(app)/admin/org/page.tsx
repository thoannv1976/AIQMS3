import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, Button, Input, Select, Th, Td } from "@/components/ui";
import { CreateFacultyForm, CreateDepartmentForm } from "./OrgForms";
import { renameFacultyAction, deleteFacultyAction, deleteDepartmentAction, setUserDepartmentAction } from "./actions";

export default async function AdminOrgPage() {
  const actor = await requireUser();
  if (!can(actor.role, "admin:users")) redirect("/dashboard");

  const [faculties, users] = await Promise.all([
    prisma.faculty.findMany({
      orderBy: { name: "asc" },
      include: {
        departments: { orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } },
        programs: { select: { id: true, code: true }, orderBy: { code: "asc" } },
      },
    }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, email: true, departmentId: true } }),
  ]);
  const departments = faculties.flatMap((f) => f.departments.map((d) => ({ id: d.id, label: `${f.code} · ${d.name}` })));

  return (
    <div>
      <PageHeader title="Cơ cấu tổ chức" description="Khoa / viện, bộ môn và đơn vị của người dùng — dùng để lọc Dashboard quản trị theo khoa và phân công công việc." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {faculties.map((f) => (
            <Card key={f.id}>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <form action={renameFacultyAction.bind(null, f.id)} className="flex flex-1 items-center gap-2">
                  <Badge color="blue">{f.code}</Badge>
                  <Input name="name" defaultValue={f.name} className="max-w-md" />
                  <Button type="submit" size="sm" variant="outline">
                    Lưu tên
                  </Button>
                </form>
                {f.programs.length === 0 ? (
                  <form action={deleteFacultyAction.bind(null, f.id)}>
                    <Button type="submit" size="sm" variant="ghost" title="Xóa khoa (không còn chương trình)">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </form>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-slate-500">
                  Chương trình: {f.programs.length ? f.programs.map((p) => p.code).join(", ") : "chưa có"}
                </div>
                {f.departments.length ? (
                  <table className="w-full">
                    <thead className="border-b border-slate-100 bg-slate-50">
                      <tr>
                        <Th>Mã</Th>
                        <Th>Bộ môn</Th>
                        <Th>Số người</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {f.departments.map((d) => (
                        <tr key={d.id}>
                          <Td className="font-mono text-xs">{d.code}</Td>
                          <Td>{d.name}</Td>
                          <Td>{d._count.users}</Td>
                          <Td>
                            <form action={deleteDepartmentAction.bind(null, d.id)}>
                              <Button type="submit" size="sm" variant="ghost" title="Xóa bộ môn (người dùng được giữ lại, bỏ gán đơn vị)">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </form>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-500">Chưa có bộ môn.</p>
                )}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle>Gán người dùng vào bộ môn</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <Th>Người dùng</Th>
                    <Th>Bộ môn / đơn vị</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <Td>
                        <div className="font-medium text-slate-800">{u.fullName}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </Td>
                      <Td>
                        <form action={setUserDepartmentAction} className="flex items-center gap-2">
                          <input type="hidden" name="userId" value={u.id} />
                          <Select name="departmentId" defaultValue={u.departmentId ?? ""} className="w-auto">
                            <option value="">— Chưa gán —</option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.label}
                              </option>
                            ))}
                          </Select>
                          <Button type="submit" size="sm" variant="outline">
                            Lưu
                          </Button>
                        </form>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Thêm khoa / viện</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateFacultyForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Thêm bộ môn</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateDepartmentForm faculties={faculties.map((f) => ({ id: f.id, name: f.name }))} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
