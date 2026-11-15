import Link from "next/link";
import { Plus, FileText, Sparkles, FileSpreadsheet, Upload, Grid3x3, Lock, Copy, Search } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { resolveProgram, programRolesOf } from "@/lib/program-context";
import { evidenceVisibilityWhere, validityState } from "@/lib/access";
import { findProgramDuplicates } from "@/lib/evidence/duplicates";
import { ragRetrieve } from "@/lib/ai/features";
import { allowedConfidentiality, APPROVED_LIKE } from "@/lib/access";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, LinkButton, PageHeader, Badge, EmptyState, Th, Td, Input, Select, Button } from "@/components/ui";
import { evidenceStatus, confidentiality as confMeta } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { EvidenceStatus, Role } from "@/generated/prisma/enums";
import { BulkClassifyButton } from "./BulkClassifyButton";

type Sp = { program?: string; q?: string; mode?: string; status?: string; validity?: string; linked?: string };

export default async function EvidencePage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);
  const canWrite = selected ? canInProgram(user.role, await programRolesOf(user.id, selected.id), "evidence:write") : false;
  const q = (sp.q ?? "").trim();
  const semantic = sp.mode === "semantic" && q.length > 0;

  let snippets = new Map<string, string>();
  let evidence: Array<
    Prisma.EvidenceGetPayload<{ include: { _count: { select: { criterionLinks: true } }; document: { select: { id: true; status: true } } } }>
  > = [];

  if (selected) {
    const where: Prisma.EvidenceWhereInput = { ...(await evidenceVisibilityWhere(user, selected.id)) };
    const and: Prisma.EvidenceWhereInput[] = [];
    if (sp.status && sp.status in EvidenceStatus) and.push({ status: sp.status as EvidenceStatus });
    if (sp.linked === "no") and.push({ criterionLinks: { none: {} } });
    const now = new Date();
    if (sp.validity === "expired") and.push({ validUntil: { lt: now } });
    if (sp.validity === "expiring") and.push({ validUntil: { gte: now, lte: new Date(now.getTime() + 60 * 86400000) } });
    if (sp.validity === "locked") and.push({ locked: true });

    if (semantic) {
      const hits = await ragRetrieve(selected.id, q, 30, {
        confidentiality: await allowedConfidentiality(user, selected.id),
        statuses: user.role === Role.EXTERNAL_REVIEWER ? APPROVED_LIKE : undefined,
      });
      const order: string[] = [];
      for (const h of hits) {
        if (h.evidenceId && !snippets.has(h.evidenceId)) {
          snippets.set(h.evidenceId, h.content.replace(/\s+/g, " ").slice(0, 220));
          order.push(h.evidenceId);
        }
      }
      and.push({ id: { in: order } });
      const rows = await prisma.evidence.findMany({
        where: { ...where, AND: and },
        include: { _count: { select: { criterionLinks: true } }, document: { select: { id: true, status: true } } },
      });
      evidence = order.map((id) => rows.find((r) => r.id === id)).filter((r): r is (typeof rows)[number] => Boolean(r));
    } else {
      if (q) {
        and.push({
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { providerUnit: { contains: q, mode: "insensitive" } },
            { document: { extractedText: { contains: q, mode: "insensitive" } } },
          ],
        });
      }
      evidence = await prisma.evidence.findMany({
        where: { ...where, AND: and },
        include: { _count: { select: { criterionLinks: true } }, document: { select: { id: true, status: true } } },
        orderBy: { code: "asc" },
      });
      if (q) {
        const docs = await prisma.document.findMany({
          where: { evidenceId: { in: evidence.map((e) => e.id) }, extractedText: { contains: q, mode: "insensitive" } },
          select: { evidenceId: true, extractedText: true },
        });
        snippets = new Map(
          docs.map((d) => {
            const t = d.extractedText ?? "";
            const i = t.toLowerCase().indexOf(q.toLowerCase());
            return [d.evidenceId!, (i > 60 ? "…" : "") + t.slice(Math.max(0, i - 60), i + 160).replace(/\s+/g, " ") + "…"];
          }),
        );
      }
    }
  }

  const dupMap = selected && evidence.length > 1 ? await findProgramDuplicates(selected.id) : new Map();
  const unlinked = selected && canWrite ? await prisma.evidence.count({ where: { programId: selected.id, criterionLinks: { none: {} }, locked: false } }) : 0;
  const filtered = Boolean(q || sp.status || sp.validity || sp.linked);

  return (
    <div>
      <PageHeader
        title="Minh chứng kiểm định"
        description="Thu thập, phân loại, liên kết tiêu chí và phê duyệt minh chứng"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ProgramSwitcher programs={programs} selectedId={selected?.id} />
            {selected && (
              <LinkButton href={`/evidence/matrix?program=${selected.id}`} variant="outline">
                <Grid3x3 className="h-4 w-4" /> Ma trận
              </LinkButton>
            )}
            {selected && evidence.length > 0 && (
              <a
                href={`/evidence/export?program=${selected.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-4 w-4" /> Xuất Excel
              </a>
            )}
            {selected && canWrite && (
              <>
                <LinkButton href={`/evidence/bulk?program=${selected.id}`} variant="outline">
                  <Upload className="h-4 w-4" /> Tải hàng loạt
                </LinkButton>
                <LinkButton href={`/evidence/new?program=${selected.id}`}>
                  <Plus className="h-4 w-4" /> Tải minh chứng
                </LinkButton>
              </>
            )}
          </div>
        }
      />

      {selected && (
        <form className="mb-4 flex flex-wrap items-center gap-2" action="/evidence">
          <input type="hidden" name="program" value={selected.id} />
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Tìm minh chứng: mã, tên, nội dung… hoặc câu hỏi tự nhiên" className="pl-8" />
          </div>
          <Select name="mode" defaultValue={sp.mode ?? "keyword"} className="w-auto">
            <option value="keyword">Theo từ khóa</option>
            <option value="semantic">Theo ý nghĩa (AI)</option>
          </Select>
          <Select name="status" defaultValue={sp.status ?? ""} className="w-auto">
            <option value="">Mọi trạng thái</option>
            {Object.entries(evidenceStatus).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <Select name="validity" defaultValue={sp.validity ?? ""} className="w-auto">
            <option value="">Mọi hiệu lực</option>
            <option value="expiring">Sắp hết hạn (≤ 60 ngày)</option>
            <option value="expired">Hết hiệu lực</option>
            <option value="locked">Đã khóa phiên bản</option>
          </Select>
          <Select name="linked" defaultValue={sp.linked ?? ""} className="w-auto">
            <option value="">Mọi liên kết</option>
            <option value="no">Chưa gắn tiêu chí</option>
          </Select>
          <Button type="submit" variant="outline">
            Lọc
          </Button>
          {filtered && (
            <Link href={`/evidence?program=${selected.id}`} className="text-sm text-slate-500 hover:underline">
              Xóa lọc
            </Link>
          )}
        </form>
      )}

      {selected && canWrite && unlinked > 0 && <BulkClassifyButton programId={selected.id} count={Math.min(unlinked, 30)} />}

      {!selected ? (
        <EmptyState title="Chưa có chương trình" description="Hãy tạo chương trình đào tạo trước." />
      ) : evidence.length === 0 ? (
        <EmptyState
          title={filtered ? "Không có minh chứng phù hợp" : "Chưa có minh chứng"}
          description={filtered ? "Thử từ khóa khác hoặc xóa bộ lọc." : "Tải lên minh chứng đầu tiên cho chương trình này."}
          action={
            canWrite && !filtered ? (
              <LinkButton href={`/evidence/bulk?program=${selected.id}`}>
                <Upload className="h-4 w-4" /> Tải minh chứng hàng loạt
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
                  <Th>Hiệu lực</Th>
                  <Th>Trạng thái</Th>
                  <Th>Cập nhật</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {evidence.map((e) => {
                  const v = validityState(e.validUntil);
                  const dups = dupMap.get(e.id) ?? [];
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap font-medium">
                        <Link href={`/evidence/${e.id}`} className="text-slate-900 hover:text-brand-600">
                          {e.code}
                        </Link>
                        {e.locked && <Lock className="ml-1 inline h-3.5 w-3.5 text-slate-400" aria-label="Đã khóa phiên bản" />}
                        <span className="ml-1 text-[11px] font-normal text-slate-400">v{e.version}</span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          {e.document && <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                          <span>{e.title}</span>
                          {dups.length > 0 && (
                            <span title={`Có thể trùng với ${dups.map((d: { code: string }) => d.code).join(", ")}`}>
                              <Badge color="amber">
                                <Copy className="mr-0.5 inline h-3 w-3" />
                                Có thể trùng
                              </Badge>
                            </span>
                          )}
                        </div>
                        {snippets.get(e.id) && <div className="mt-1 text-xs text-slate-500">{snippets.get(e.id)}</div>}
                      </Td>
                      <Td className="text-slate-500">{e.providerUnit ?? "—"}</Td>
                      <Td>
                        <Badge color={e._count.criterionLinks > 0 ? "green" : "amber"}>{e._count.criterionLinks}</Badge>
                      </Td>
                      <Td>
                        <Badge color={confMeta[e.confidentiality].color}>{confMeta[e.confidentiality].label}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {v === "none" && <span className="text-slate-400">—</span>}
                        {v === "valid" && <span className="text-slate-500">đến {formatDate(e.validUntil)}</span>}
                        {v === "expiring" && <Badge color="amber">Sắp hết hạn {formatDate(e.validUntil)}</Badge>}
                        {v === "expired" && <Badge color="red">Hết hiệu lực</Badge>}
                      </Td>
                      <Td>
                        <Badge color={evidenceStatus[e.status].color}>{evidenceStatus[e.status].label}</Badge>
                      </Td>
                      <Td className="text-xs text-slate-400">{formatDate(e.updatedAt)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
        <Sparkles className="h-3.5 w-3.5" /> Mở một minh chứng để dùng AI tóm tắt nội dung, gợi ý tiêu chí, tải phiên bản mới hoặc khóa phiên bản.
      </p>
    </div>
  );
}
