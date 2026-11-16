// Global search (Ctrl+K): pages, programs, evidence, report sections, criteria, courses, users — scoped to what the user may see.
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { allowedProgramIds, canSeeEvidence } from "@/lib/access";
import { NAV_GROUPS } from "@/lib/nav";
import { Role } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export interface SearchHit {
  kind: "page" | "program" | "evidence" | "section" | "criterion" | "course" | "user";
  title: string;
  sub?: string;
  href: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ hits: [] }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ hits: [] });
  const ci = { contains: q, mode: "insensitive" as const };
  const scope = await allowedProgramIds(user);
  const inScope = scope ? { in: scope } : undefined;
  const hits: SearchHit[] = [];

  // Pages from the menu (accent-insensitive).
  const fq = fold(q);
  for (const g of NAV_GROUPS) for (const it of g.items) if (can(user.role, it.capability) && fold(it.label).includes(fq)) hits.push({ kind: "page", title: it.label, sub: g.title, href: it.href });

  const [programs, evidence, sections, criteria, courses, users] = await Promise.all([
    prisma.program.findMany({ where: { id: inScope, OR: [{ code: ci }, { nameVi: ci }, { sandboxLabel: ci }] }, take: 6, select: { id: true, code: true, nameVi: true } }),
    prisma.evidence.findMany({
      where: { programId: inScope, OR: [{ code: ci }, { title: ci }, { providerUnit: ci }] },
      take: 20, orderBy: { code: "asc" },
      select: { id: true, code: true, title: true, programId: true, confidentiality: true, status: true, program: { select: { code: true } } },
    }),
    user.role === Role.EXTERNAL_REVIEWER
      ? Promise.resolve([])
      : prisma.reportSection.findMany({ where: { title: ci, report: { cycle: { programId: inScope } } }, take: 6, select: { id: true, title: true, reportId: true, report: { select: { cycle: { select: { program: { select: { code: true } } } } } } } }),
    prisma.criterion.findMany({ where: { OR: [{ code: { startsWith: q } }, { title: ci }] }, take: 6, select: { code: true, title: true, standard: { select: { setId: true, set: { select: { name: true } } } } } }),
    prisma.course.findMany({ where: { programId: inScope, OR: [{ code: ci }, { nameVi: ci }] }, take: 6, select: { id: true, code: true, nameVi: true, program: { select: { code: true } } } }),
    can(user.role, "admin:users") ? prisma.user.findMany({ where: { OR: [{ fullName: ci }, { email: ci }] }, take: 5, select: { fullName: true, email: true } }) : Promise.resolve([]),
  ]);
  for (const p of programs) hits.push({ kind: "program", title: `${p.code} — ${p.nameVi}`, href: `/programs/${p.id}` });
  let shown = 0;
  for (const e of evidence) {
    if (shown >= 8) break;
    if (!(await canSeeEvidence(user, e))) continue;
    hits.push({ kind: "evidence", title: `${e.code} — ${e.title}`, sub: e.program.code, href: `/evidence/${e.id}` });
    shown++;
  }
  for (const s of sections) hits.push({ kind: "section", title: s.title, sub: s.report.cycle.program.code, href: `/reports/${s.reportId}` });
  for (const c of criteria) hits.push({ kind: "criterion", title: `${c.code} — ${c.title}`, sub: c.standard.set.name.split("—")[0].trim(), href: `/standards/${c.standard.setId}` });
  for (const c of courses) hits.push({ kind: "course", title: `${c.code} — ${c.nameVi}`, sub: c.program.code, href: `/syllabi/${c.id}` });
  for (const u of users) hits.push({ kind: "user", title: u.fullName, sub: u.email, href: `/admin/users` });
  return Response.json({ hits: hits.slice(0, 40) });
}
