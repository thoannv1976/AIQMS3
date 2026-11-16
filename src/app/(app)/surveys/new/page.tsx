import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { resolveProgram, programRolesOf } from "@/lib/program-context";
import { SURVEY_TEMPLATES } from "@/lib/surveys/templates";
import { surveyAudience } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, Input, Label, Select, Textarea, Button, LinkButton } from "@/components/ui";
import { createSurveyAction } from "../manage-actions";

export default async function NewSurveyPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { selected } = await resolveProgram(sp.program);
  if (!selected) redirect("/programs");
  if (!canInProgram(user.role, await programRolesOf(user.id, selected.id), "survey:write")) redirect("/surveys");
  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId: selected.id },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    include: { standardSet: { include: { standards: { orderBy: { order: "asc" }, include: { criteria: { orderBy: { order: "asc" } } } } } } },
  });
  const criteria = cycle ? cycle.standardSet.standards.flatMap((s) => s.criteria) : [];

  return (
    <div className="max-w-3xl">
      <PageHeader title="Tạo phiếu khảo sát" description={`Chương trình: ${selected.code} — ${selected.nameVi}`} />
      <Card>
        <CardHeader>
          <CardTitle>Thông tin phiếu</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createSurveyAction} className="space-y-4">
            <input type="hidden" name="programId" value={selected.id} />
            <div>
              <Label htmlFor="template">Tạo từ mẫu (bộ phiếu SBI)</Label>
              <Select id="template" name="template" defaultValue="">
                <option value="">— Phiếu trống (tự thêm câu hỏi) —</option>
                {SURVEY_TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.title} ({t.questions.length} câu)
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-400">Chọn mẫu thì có thể để trống tiêu đề/đối tượng — hệ thống lấy theo mẫu.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="title">Tiêu đề</Label>
                <Input id="title" name="title" placeholder="VD: Khảo sát sinh viên năm học 2026–2027" />
              </div>
              <div>
                <Label htmlFor="audience">Đối tượng</Label>
                <Select id="audience" name="audience" defaultValue="">
                  <option value="">— Theo mẫu —</option>
                  {Object.entries(surveyAudience).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="description">Lời giới thiệu</Label>
              <Textarea id="description" name="description" rows={2} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="opensAt">Mở từ ngày</Label>
                <Input id="opensAt" name="opensAt" type="date" />
              </div>
              <div>
                <Label htmlFor="closesAt">Đóng ngày</Label>
                <Input id="closesAt" name="closesAt" type="date" />
              </div>
              <div>
                <Label htmlFor="criterionId">Gắn tiêu chí</Label>
                <Select id="criterionId" name="criterionId" defaultValue="">
                  <option value="">— Không —</option>
                  {criteria.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Tạo phiếu</Button>
              <LinkButton href={`/surveys?program=${selected.id}`} variant="outline">
                Hủy
              </LinkButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
