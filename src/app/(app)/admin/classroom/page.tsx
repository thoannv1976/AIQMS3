import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, roleLabel } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ClassroomManager } from "./ClassroomManager";

export const dynamic = "force-dynamic";

export default async function ClassroomPage() {
  const user = await requireUser();
  if (!can(user.role, "admin:users")) redirect("/dashboard");
  const [templates, sandboxes, users] = await Promise.all([
    prisma.program.findMany({ where: { isSandbox: false }, orderBy: { code: "asc" }, select: { id: true, code: true, nameVi: true } }),
    prisma.program.findMany({
      where: { isSandbox: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, code: true, sandboxLabel: true, sandboxTemplateId: true, createdAt: true,
        _count: { select: { programRoles: true, evidence: true } },
        cycles: { select: { reports: { select: { sections: { select: { status: true } } } } } },
      },
    }),
    prisma.user.findMany({ where: { isActive: true, role: { not: "ADMIN" } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, email: true, role: true } }),
  ]);
  const codeOf = new Map(templates.map((t) => [t.id, t.code]));
  return (
    <div>
      <PageHeader
        title="Lớp thực hành"
        description="Tạo bản sao chương trình riêng cho từng lớp/nhóm học viên, đặt lại sau buổi học, không ảnh hưởng dữ liệu thật"
      />
      <ClassroomManager
        templates={templates}
        users={users.map((u) => ({ ...u, role: roleLabel(u.role) }))}
        sandboxes={sandboxes.map((s) => {
          const secs = s.cycles.flatMap((c) => c.reports.flatMap((r) => r.sections));
          return {
            id: s.id, code: s.code, label: s.sandboxLabel, templateCode: s.sandboxTemplateId ? codeOf.get(s.sandboxTemplateId) ?? null : null,
            members: s._count.programRoles, evidence: s._count.evidence, sections: secs.length, sectionsDone: secs.filter((x) => x.status === "DONE").length,
            createdAt: s.createdAt.toISOString(),
          };
        })}
      />
    </div>
  );
}
