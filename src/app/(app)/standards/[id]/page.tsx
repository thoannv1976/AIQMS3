import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, AlertCircle, Pencil } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, Input, Button, LinkButton } from "@/components/ui";
import { ConfirmButton } from "@/components/form-controls";
import {
  updateStandardSetAction,
  createStandardAction,
  updateStandardAction,
  deleteStandardAction,
  createCriterionAction,
  updateCriterionAction,
  deleteCriterionAction,
} from "../actions";

export default async function StandardSetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const canWrite = can(user.role, "standard:write");
  const editing = canWrite && sp.edit === "1";

  const set = await prisma.accreditationStandardSet.findUnique({
    where: { id },
    include: {
      _count: { select: { cycles: true } },
      standards: {
        orderBy: { order: "asc" },
        include: {
          criteria: {
            orderBy: { order: "asc" },
            include: { _count: { select: { evidenceLinks: true, reportSections: true } } },
          },
        },
      },
    },
  });
  if (!set) notFound();
  const criteriaCount = set.standards.reduce((a, s) => a + s.criteria.length, 0);

  return (
    <div>
      <PageHeader
        title={set.name}
        description={`${set.code} · ${set.standards.length} tiêu chuẩn · ${criteriaCount} tiêu chí · ${set._count.cycles} chu kỳ đang dùng`}
        actions={
          canWrite &&
          (editing ? (
            <LinkButton href={`/standards/${set.id}`} variant="primary">
              Xong
            </LinkButton>
          ) : (
            <LinkButton href={`/standards/${set.id}?edit=1`} variant="outline">
              <Pencil className="h-4 w-4" /> Chỉnh sửa bộ tiêu chuẩn
            </LinkButton>
          ))
        }
      />
      {set.description && !editing && <p className="-mt-3 mb-5 text-sm text-slate-500">{set.description}</p>}

      {editing && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Thông tin bộ tiêu chuẩn</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateStandardSetAction.bind(null, set.id)} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Input name="name" defaultValue={set.name} required />
              <Input name="description" defaultValue={set.description ?? ""} placeholder="Mô tả" />
              <Button type="submit" variant="outline">
                Lưu
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-5">
        {set.standards.map((std) => {
          const stdUsed = std.criteria.some((c) => c._count.evidenceLinks > 0 || c._count.reportSections > 0);
          return (
            <Card key={std.id}>
              <CardHeader>
                {editing ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={updateStandardAction.bind(null, std.id)} className="flex flex-1 flex-wrap items-center gap-2">
                      <Input name="code" defaultValue={std.code} className="w-20" required />
                      <Input name="title" defaultValue={std.title} className="min-w-64 flex-1" required />
                      <Button type="submit" size="sm" variant="outline">
                        Lưu
                      </Button>
                    </form>
                    {!stdUsed && (
                      <form action={deleteStandardAction.bind(null, std.id)}>
                        <ConfirmButton message={`Xóa tiêu chuẩn ${std.code} và toàn bộ tiêu chí của nó?`}>Xóa</ConfirmButton>
                      </form>
                    )}
                  </div>
                ) : (
                  <CardTitle className="flex items-center gap-2">
                    <Badge color="blue">Tiêu chuẩn {std.code}</Badge>
                    <span>{std.title}</span>
                  </CardTitle>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {std.criteria.length === 0 && <p className="text-sm text-slate-500">Chưa có tiêu chí.</p>}
                {std.criteria.map((c) => {
                  const has = c._count.evidenceLinks > 0;
                  const used = has || c._count.reportSections > 0;
                  if (editing) {
                    return (
                      <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                        <form action={updateCriterionAction.bind(null, c.id)} className="flex flex-1 flex-wrap items-center gap-2">
                          <Input name="code" defaultValue={c.code} className="w-20" required />
                          <Input name="title" defaultValue={c.title} className="min-w-64 flex-1" required />
                          <Button type="submit" size="sm" variant="outline">
                            Lưu
                          </Button>
                        </form>
                        {used ? (
                          <span className="text-xs text-slate-400" title="Tiêu chí đã có minh chứng hoặc mục báo cáo">
                            đang dùng
                          </span>
                        ) : (
                          <form action={deleteCriterionAction.bind(null, c.id)}>
                            <ConfirmButton message={`Xóa tiêu chí ${c.code}?`}>Xóa</ConfirmButton>
                          </form>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                      <div className="flex items-start gap-2">
                        {has ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                        ) : (
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        )}
                        <div>
                          <span className="text-sm font-medium text-slate-800">{c.code}</span>{" "}
                          <span className="text-sm text-slate-600">{c.title}</span>
                        </div>
                      </div>
                      <Badge color={has ? "green" : "amber"}>{c._count.evidenceLinks} minh chứng</Badge>
                    </div>
                  );
                })}
                {editing && (
                  <form
                    action={createCriterionAction.bind(null, std.id)}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2"
                  >
                    <Input name="code" placeholder={`${std.code}.${std.criteria.length + 1}`} className="w-20" required />
                    <Input name="title" placeholder="Nội dung tiêu chí mới" className="min-w-64 flex-1" required />
                    <Button type="submit" size="sm">
                      Thêm tiêu chí
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}

        {set.standards.length === 0 && !editing && (
          <Card>
            <CardContent className="text-sm text-slate-500">
              Bộ tiêu chuẩn chưa có tiêu chuẩn nào.{" "}
              {canWrite && (
                <Link href={`/standards/${set.id}?edit=1`} className="text-brand-600 hover:underline">
                  Thêm tiêu chuẩn
                </Link>
              )}
            </CardContent>
          </Card>
        )}

        {editing && (
          <Card>
            <CardHeader>
              <CardTitle>Thêm tiêu chuẩn</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createStandardAction.bind(null, set.id)} className="flex flex-wrap items-center gap-2">
                <Input name="code" placeholder={String(set.standards.length + 1)} className="w-20" required />
                <Input name="title" placeholder="Tên tiêu chuẩn" className="min-w-64 flex-1" required />
                <Button type="submit">Thêm tiêu chuẩn</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
