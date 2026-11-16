import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { canAccessProgram } from "@/lib/access";
import { PageHeader } from "@/components/ui";
import { FactsEditor } from "./FactsEditor";
import { canEditFacts } from "@/lib/facts";

export const dynamic = "force-dynamic";

export default async function ProgramFactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const program = await prisma.program.findUnique({ where: { id }, select: { id: true, code: true, nameVi: true } });
  if (!program || !(await canAccessProgram(user, id))) notFound();
  const facts = await prisma.programFact.findMany({ where: { programId: id }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  const canEdit = await canEditFacts(user.id, user.role, id);
  return (
    <div>
      <PageHeader
        title="Số liệu chính của chương trình"
        description={`${program.code} — ${program.nameVi} · Nhập một lần, AI dùng thống nhất khi soạn báo cáo tự đánh giá`}
        actions={<Link href={`/programs/${id}`} className="text-sm text-brand-700 hover:underline">← Về chương trình</Link>}
      />
      <p className="mb-4 text-sm text-slate-600">
        Ví dụ: số người học đang học, số giảng viên cơ hữu theo trình độ, tỷ lệ người học/giảng viên, tỷ lệ tốt nghiệp đúng hạn, tỷ lệ thôi học, tỷ lệ việc làm sau 12 tháng, mức hài lòng của nhà tuyển dụng.
        Ghi mã minh chứng nguồn để AI trích dẫn đúng. Khi các minh chứng ghi số liệu khác nhau, dùng nút <b>AI đối chiếu</b> để phát hiện.
      </p>
      <FactsEditor
        programId={id}
        canEdit={canEdit}
        canUseAi={can(user.role, "ai:use")}
        facts={facts.map((f) => ({ id: f.id, groupName: f.groupName, label: f.label, value: f.value, unit: f.unit, period: f.period, sourceCode: f.sourceCode, note: f.note }))}
      />
    </div>
  );
}
