import Link from "next/link";
import { Plus, FileText, Sparkles, FileSpreadsheet } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { resolveProgram, programRolesOf } from "@/lib/program-context";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, LinkButton, PageHeader, Badge, EmptyState, Th, Td } from "@/components/ui";
import { evidenceStatus, confidentiality as confMeta } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export default async function EvidencePage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);
  const canWrite = selected
    ? canInProgram(user.role, await programRolesOf(user.id, selected.id), "evidence:write")
    : false;

  const evidence = selected
    ? await prisma.evidence.findMany({
        where: { programId: selected.id },
        include: { _count: { select: { criterionLinks: true } }, document: { select: { id: true } } },
        orderBy: { code: "asc" },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Minh chứng kiểm định"
        description="Thu thập, phân loại, liên kết tiêu chí và phê duyệt minh chứng"
        actions={
          <div className="flex items-center gap-3">
            <ProgramSwitcher programs={programs} selectedId={selected?.id} />
            {selected && evidence.length > 0 && (
              <a
                href={`/evidence/export?program=${selected.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-4 w-4" /> Xuất Excel
              </a>
            )}
            {selected && canWrite && (
              <LinkButton href={`/evidence/new?program=${selected.id}`}>
                <Plus className="h-4 w-4" /> Tải minh chứng
              </LinkButton>
            )}
          </div>
        }
      />

      {!selected ? (
        <EmptyState title="Chưa có chương trình" description="Hãy tạo chương trình đào tạo trước." />
      ) : evidence.length === 0 ? (
        <EmptyState
          title="Chưa có minh chứng"
          description="Tải lên minh chứng đầu tiên cho chương trình này."
          action={
            canWrite ? (
              <LinkButton href={`/evidence/new?program=${selected.id}`}>
                <Plus className="h-4 w-4" /> Tải minh chứng
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <Th>Mã</Th>
                  <Th>Tên minh chứng</Th>
                  <Th>Đơn vị</Th>
                  <Th>Tiêu chí</Th>
                  <Th>Bảo mật</Th>
                  <Th>Trạng thái</Th>
                  <Th>Cập nhật</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {evidence.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <Td className="font-medium">
                      <Link href={`/evidence/${e.id}`} className="text-slate-900 hover:text-brand-600">
                        {e.code}
                      </Link>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {e.document && <FileText className="h-3.5 w-3.5 text-slate-400" />}
                        {e.title}
                      </div>
                    </Td>
                    <Td className="text-slate-500">{e.providerUnit ?? "—"}</Td>
                    <Td>
                      <Badge color={e._count.criterionLinks > 0 ? "green" : "amber"}>{e._count.criterionLinks}</Badge>
                    </Td>
                    <Td>
                      <Badge color={confMeta[e.confidentiality].color}>{confMeta[e.confidentiality].label}</Badge>
                    </Td>
                    <Td>
                      <Badge color={evidenceStatus[e.status].color}>{evidenceStatus[e.status].label}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-400">{formatDate(e.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
        <Sparkles className="h-3.5 w-3.5" /> Mở một minh chứng để dùng AI tóm tắt nội dung và gợi ý tiêu chí phù hợp.
      </p>
    </div>
  );
}
