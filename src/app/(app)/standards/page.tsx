import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, Badge, EmptyState, Input, Button } from "@/components/ui";
import { createStandardSetAction } from "./actions";

export default async function StandardsPage() {
  const user = await requireUser();
  const canWrite = can(user.role, "standard:write");
  const sets = await prisma.accreditationStandardSet.findMany({
    include: {
      _count: { select: { standards: true, cycles: true } },
      standards: { select: { _count: { select: { criteria: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader title="Bộ tiêu chuẩn kiểm định" description="Quản lý các bộ tiêu chuẩn, tiêu chí phục vụ kiểm định CTĐT" />
      {sets.length === 0 ? (
        <EmptyState title="Chưa có bộ tiêu chuẩn" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sets.map((s) => {
            const criteria = s.standards.reduce((acc, st) => acc + st._count.criteria, 0);
            return (
              <Link key={s.id} href={`/standards/${s.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent>
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge color="blue">{s.code}</Badge>
                        <h3 className="mt-2 font-semibold text-slate-900">{s.name}</h3>
                        {s.description && <p className="mt-1 text-sm text-slate-500">{s.description}</p>}
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-4 flex gap-3 text-xs text-slate-500">
                      <span>{s._count.standards} tiêu chuẩn</span>
                      <span>·</span>
                      <span>{criteria} tiêu chí</span>
                      <span>·</span>
                      <span>{s._count.cycles} chu kỳ dùng</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {canWrite && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Thêm bộ tiêu chuẩn</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createStandardSetAction} className="grid gap-3 md:grid-cols-[160px_1fr_1fr_auto]">
              <Input name="code" placeholder="Mã, VD: NOIBO_2026" required />
              <Input name="name" placeholder="Tên bộ tiêu chuẩn" required />
              <Input name="description" placeholder="Mô tả (tùy chọn)" />
              <Button type="submit">Tạo</Button>
            </form>
            <p className="mt-2 text-xs text-slate-500">
              Sau khi tạo, mở bộ tiêu chuẩn để thêm tiêu chuẩn và tiêu chí. Có thể dùng cho bộ tiêu chí nội bộ của trường.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
