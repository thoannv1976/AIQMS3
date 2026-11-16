import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { programRolesOf } from "@/lib/program-context";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, EmptyState, Input, Textarea, Select, Button, Label, LinkButton } from "@/components/ui";
import { ConfirmButton } from "@/components/form-controls";
import { DescItem } from "@/components/widgets";
import { syllabusStatus, contributionLevel, cloPloStrength } from "@/lib/labels";
import { SyllabusReviewPanel } from "./SyllabusReviewPanel";
import { SyllabusImport } from "./SyllabusImport";
import { canAccessProgram } from "@/lib/access";
import {
  createCloAction,
  updateCloAction,
  deleteCloAction,
  linkCloPloAction,
  unlinkCloPloAction,
  saveSyllabusAction,
} from "./edit-actions";

export default async function SyllabusDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { courseId } = await params;
  const sp = await searchParams;
  const user = await requireUser();

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      program: { include: { plos: { orderBy: { code: "asc" } } } },
      clos: { orderBy: { code: "asc" }, include: { ploLinks: { include: { plo: true } } } },
      syllabi: { orderBy: { createdAt: "desc" }, take: 1 },
      curriculumMaps: { include: { plo: true } },
    },
  });
  if (!course || !(await canAccessProgram(user, course.programId))) notFound();
  const syl = course.syllabi[0];

  const roles = await programRolesOf(user.id, course.programId);
  const canOutcome = canInProgram(user.role, roles, "outcome:write");
  const canSyllabus = canInProgram(user.role, roles, "syllabus:write");
  const editing = (canOutcome || canSyllabus) && sp.edit === "1";
  const plos = course.program.plos;

  return (
    <div>
      <PageHeader
        title={`${course.code} — ${course.nameVi}`}
        description={`${course.program.code} · ${course.credits} tín chỉ · Học kỳ ${course.semester ?? "—"}`}
        actions={
          <div className="flex items-center gap-2">
            {syl && <Badge color={syllabusStatus[syl.status].color}>{syllabusStatus[syl.status].label}</Badge>}
            {(canOutcome || canSyllabus) &&
              (editing ? (
                <LinkButton href={`/syllabi/${course.id}`}>Xong</LinkButton>
              ) : (
                <LinkButton href={`/syllabi/${course.id}?edit=1`} variant="outline">
                  <Pencil className="h-4 w-4" /> Chỉnh sửa đề cương & CLO
                </LinkButton>
              ))}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {!editing && <SyllabusReviewPanel courseId={course.id} />}
          {editing && canSyllabus && <SyllabusImport courseId={course.id} />}

          <Card>
            <CardHeader>
              <CardTitle>Đề cương học phần</CardTitle>
            </CardHeader>
            <CardContent>
              {editing && canSyllabus ? (
                <form action={saveSyllabusAction.bind(null, course.id)} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="version">Phiên bản</Label>
                      <Input id="version" name="version" defaultValue={syl?.version ?? "1.0"} />
                    </div>
                    <div>
                      <Label htmlFor="status">Trạng thái</Label>
                      <Select id="status" name="status" defaultValue={syl?.status ?? "DRAFT"}>
                        {Object.entries(syllabusStatus).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  {(
                    [
                      ["objectives", "Mục tiêu học phần", syl?.objectives],
                      ["content", "Nội dung", syl?.content],
                      ["teachingMethods", "Phương pháp giảng dạy", syl?.teachingMethods],
                      ["assessmentMethods", "Phương pháp đánh giá (kèm tỷ trọng)", syl?.assessmentMethods],
                      ["materials", "Tài liệu học tập", syl?.materials],
                      ["schedule", "Kế hoạch giảng dạy (theo tuần)", syl?.schedule],
                      ["requirements", "Yêu cầu đối với người học", syl?.requirements],
                    ] as const
                  ).map(([name, label, value]) => (
                    <div key={name}>
                      <Label htmlFor={name}>{label}</Label>
                      <Textarea id={name} name={name} rows={3} defaultValue={value ?? ""} />
                    </div>
                  ))}
                  <Button type="submit">Lưu đề cương</Button>
                </form>
              ) : syl ? (
                <dl className="divide-y divide-slate-100">
                  <DescItem label="Mục tiêu">{syl.objectives ?? "—"}</DescItem>
                  <DescItem label="Nội dung">{syl.content ?? "—"}</DescItem>
                  <DescItem label="Phương pháp giảng dạy">{syl.teachingMethods ?? "—"}</DescItem>
                  <DescItem label="Phương pháp đánh giá">{syl.assessmentMethods ?? "—"}</DescItem>
                  <DescItem label="Tài liệu học tập">{syl.materials ?? "—"}</DescItem>
                  <DescItem label="Kế hoạch giảng dạy"><span className="whitespace-pre-line">{syl.schedule ?? "—"}</span></DescItem>
                  <DescItem label="Yêu cầu đối với người học">{syl.requirements ?? "—"}</DescItem>
                </dl>
              ) : (
                <EmptyState
                  title="Chưa có đề cương"
                  description={canSyllabus ? "Bấm “Chỉnh sửa đề cương & CLO” để nhập đề cương." : "Học phần này chưa có đề cương."}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chuẩn đầu ra học phần (CLO) & liên kết PLO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {course.clos.length === 0 && <p className="text-sm text-slate-500">Chưa có CLO.</p>}
              {course.clos.map((c) => (
                <div key={c.id} className="space-y-2 rounded-lg border border-slate-100 p-3">
                  {editing && canOutcome ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={updateCloAction.bind(null, c.id)} className="flex flex-1 flex-wrap items-center gap-2">
                        <Input name="code" defaultValue={c.code} className="w-20" required />
                        <Input name="description" defaultValue={c.description} className="min-w-56 flex-1" required />
                        <Button type="submit" size="sm" variant="outline">
                          Lưu
                        </Button>
                      </form>
                      <form action={deleteCloAction.bind(null, c.id)}>
                        <ConfirmButton message={`Xóa ${c.code}?`}>Xóa</ConfirmButton>
                      </form>
                    </div>
                  ) : (
                    <div className="flex gap-2 text-sm">
                      <Badge color="cyan">{c.code}</Badge>
                      <span className="text-slate-700">{c.description}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 pl-1">
                    <span className="text-xs text-slate-500">→ PLO:</span>
                    {c.ploLinks.length === 0 && <span className="text-xs text-amber-600">chưa liên kết</span>}
                    {c.ploLinks.map((l) => (
                      <span key={l.id} className="inline-flex items-center gap-1">
                        <Badge color={cloPloStrength[l.strength].color}>
                          {l.plo.code} · {cloPloStrength[l.strength].label}
                        </Badge>
                        {editing && canOutcome && (
                          <form action={unlinkCloPloAction.bind(null, l.id)}>
                            <button type="submit" className="text-xs text-slate-400 hover:text-red-600" title="Bỏ liên kết">
                              ×
                            </button>
                          </form>
                        )}
                      </span>
                    ))}
                    {editing && canOutcome && plos.length > 0 && (
                      <form action={linkCloPloAction.bind(null, c.id)} className="flex items-center gap-1">
                        <Select name="ploId" className="h-7 w-auto py-0 text-xs" defaultValue="">
                          <option value="" disabled>
                            + PLO
                          </option>
                          {plos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code}
                            </option>
                          ))}
                        </Select>
                        <Select name="strength" className="h-7 w-auto py-0 text-xs" defaultValue="MEDIUM">
                          {Object.entries(cloPloStrength).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.label}
                            </option>
                          ))}
                        </Select>
                        <Button type="submit" size="sm" variant="outline" className="h-7">
                          Gắn
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
              {editing && canOutcome && (
                <form
                  action={createCloAction.bind(null, course.id)}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 p-2"
                >
                  <Input name="code" placeholder={`CLO${course.clos.length + 1}`} className="w-20" required />
                  <Input name="description" placeholder="Phát biểu CLO (động từ Bloom, đo lường được)" className="min-w-56 flex-1" required />
                  <Select name="ploId" className="w-auto" defaultValue="">
                    <option value="">— PLO liên kết —</option>
                    {plos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm">
                    Thêm CLO
                  </Button>
                </form>
              )}
              {editing && plos.length === 0 && (
                <p className="text-xs text-amber-600">
                  Chương trình chưa có PLO —{" "}
                  <Link href={`/outcomes?program=${course.programId}&edit=1`} className="underline">
                    thêm PLO trước
                  </Link>
                  .
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Đóng góp vào PLO (ma trận)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {course.curriculumMaps.length === 0 && <p className="text-sm text-slate-500">Chưa liên kết PLO.</p>}
            {course.curriculumMaps.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{m.plo.code}</span>
                <Badge color={contributionLevel[m.level].color}>{contributionLevel[m.level].label}</Badge>
              </div>
            ))}
            <Link href={`/outcomes?program=${course.programId}${canOutcome ? "&edit=1" : ""}`} className="block pt-2 text-xs text-brand-600 hover:underline">
              {canOutcome ? "Sửa mức I/R/M trong ma trận →" : "Xem ma trận chương trình →"}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
