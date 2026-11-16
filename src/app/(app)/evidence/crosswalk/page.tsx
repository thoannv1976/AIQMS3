import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { canAccessProgram } from "@/lib/access";
import { programRolesOf, resolveProgram } from "@/lib/program-context";
import { PageHeader, LinkButton } from "@/components/ui";
import { CrosswalkForm, type SetOption } from "./CrosswalkForm";

export const dynamic = "force-dynamic";

export default async function EvidenceCrosswalkPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { selected } = await resolveProgram(sp.program);
  if (!selected || !(await canAccessProgram(user, selected.id))) redirect("/evidence/matrix");
  const roles = await programRolesOf(user.id, selected.id);
  if (!canInProgram(user.role, roles, "evidence:write")) redirect(`/evidence/matrix?program=${selected.id}`);

  const [sets, cycle, links, evidenceCount] = await Promise.all([
    prisma.accreditationStandardSet.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, name: true, standards: { select: { _count: { select: { criteria: true } } } } },
    }),
    prisma.accreditationCycle.findFirst({
      where: { programId: selected.id },
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      select: { standardSetId: true, name: true },
    }),
    prisma.evidenceCriterionLink.findMany({
      where: { evidence: { programId: selected.id } },
      select: { criterion: { select: { standard: { select: { setId: true } } } } },
    }),
    prisma.evidence.count({ where: { programId: selected.id } }),
  ]);

  const linkCount = new Map<string, number>();
  for (const l of links) linkCount.set(l.criterion.standard.setId, (linkCount.get(l.criterion.standard.setId) ?? 0) + 1);
  const options: SetOption[] = sets.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    standards: s.standards.length,
    criteria: s.standards.reduce((n, x) => n + x._count.criteria, 0),
    links: linkCount.get(s.id) ?? 0,
  }));
  const defaultTarget = cycle?.standardSetId ?? options[0]?.id ?? "";
  const defaultSource =
    [...options].filter((o) => o.id !== defaultTarget && o.links > 0).sort((a, b) => b.links - a.links)[0]?.id ??
    options.find((o) => o.id !== defaultTarget)?.id ??
    "";

  return (
    <div>
      <PageHeader
        title="Chuyển mã tiêu chuẩn cho minh chứng"
        description={`${selected.code} — ${selected.nameVi} · ${evidenceCount} minh chứng${cycle ? ` · chu kỳ hiện hành: ${cycle.name}` : ""}`}
        actions={
          <LinkButton variant="outline" href={`/evidence/matrix?program=${selected.id}`}>
            Về ma trận minh chứng
          </LinkButton>
        }
      />
      <CrosswalkForm programId={selected.id} sets={options} defaultTarget={defaultTarget} defaultSource={defaultSource} />
    </div>
  );
}
