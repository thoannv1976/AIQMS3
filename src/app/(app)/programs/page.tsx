import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getProgramStats } from "@/lib/metrics";
import { Card, LinkButton, PageHeader, Badge, EmptyState, Th, Td } from "@/components/ui";
import { Progress } from "@/components/widgets";
import { degreeLevel as degreeLabel } from "@/lib/labels";

export default async function ProgramsPage() {
  const user = await requireUser();
  const programs = await prisma.program.findMany({
    include: { faculty: true, _count: { select: { courses: true, plos: true, evidence: true } } },
    orderBy: { createdAt: "asc" },
  });
  const stats = await Promise.all(programs.map((p) => getProgramStats(p.id)));

  return (
    <div>
      <PageHeader
        title="Chương trình đào tạo"
        description="Quản lý thông tin, phiên bản, chuẩn đầu ra và tiến độ kiểm định của từng CTĐT"
        actions={
          can(user.role, "program:write") ? (
            <LinkButton href="/programs/new">
              <Plus className="h-4 w-4" /> Thêm chương trình
            </LinkButton>
          ) : null
        }
      />

      {programs.length === 0 ? (
        <EmptyState title="Chưa có chương trình đào tạo" description="Tạo chương trình đầu tiên để bắt đầu." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <Th>Mã / Tên chương trình</Th>
                  <Th>Khoa</Th>
                  <Th>Trình độ</Th>
                  <Th>Học phần / PLO</Th>
                  <Th className="w-48">Sẵn sàng kiểm định</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {programs.map((p, i) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/programs/${p.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                        {p.code}
                      </Link>
                      <div className="text-xs text-slate-500">{p.nameVi}</div>
                    </Td>
                    <Td>{p.faculty.name}</Td>
                    <Td>{degreeLabel[p.degreeLevel]}</Td>
                    <Td>
                      <Badge color="slate">{p._count.courses} HP</Badge>{" "}
                      <Badge color="blue">{p._count.plos} PLO</Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Progress value={stats[i].readiness} className="w-28" />
                        <span className="text-xs font-medium text-slate-600">{stats[i].readiness}%</span>
                      </div>
                    </Td>
                    <Td>
                      <Link href={`/programs/${p.id}`} className="inline-flex text-slate-400 hover:text-brand-600">
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
