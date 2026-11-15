import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProgram } from "@/lib/access";
import { diffText, diffStats } from "@/lib/diff";
import { Card, CardContent, PageHeader, Badge, Select, Button } from "@/components/ui";
import { DiffView } from "@/components/diff-view";
import { formatDateTime } from "@/lib/utils";

type Snap = { sectionId: string; title: string; content: string | null; strengths: string | null; weaknesses: string | null; improvementPlan: string | null };
const joinAll = (s?: Snap) => (s ? [s.content, s.strengths, s.weaknesses, s.improvementPlan].filter(Boolean).join("\n") : "");

export default async function ReportVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string; all?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const report = await prisma.selfAssessmentReport.findUnique({
    where: { id },
    include: {
      cycle: { include: { program: true } },
      sections: { orderBy: { order: "asc" } },
      versions: { orderBy: { createdAt: "asc" }, include: { createdBy: { select: { fullName: true } } } },
    },
  });
  if (!report || !(await canAccessProgram(user, report.cycle.programId))) notFound();

  const current: Snap[] = report.sections.map((s) => ({ sectionId: s.id, title: s.title, content: s.content, strengths: s.strengths, weaknesses: s.weaknesses, improvementPlan: s.improvementPlan }));
  const snapOf = (key?: string): Snap[] | null => {
    if (!key || key === "current") return current;
    const v = report.versions.find((x) => x.id === key);
    return v ? (v.snapshot as unknown as Snap[]) : null;
  };
  const last = report.versions[report.versions.length - 1];
  const aKey = sp.a ?? last?.id;
  const bKey = sp.b ?? "current";
  const A = snapOf(aKey);
  const B = snapOf(bKey);
  const label = (key?: string) => (!key || key === "current" ? "Hiện tại" : (report.versions.find((v) => v.id === key)?.label ?? "?"));

  const rows =
    A && B
      ? current.map((s) => {
          const a = A.find((x) => x.sectionId === s.sectionId);
          const b = B.find((x) => x.sectionId === s.sectionId);
          const parts = diffText(joinAll(a), joinAll(b));
          return { title: s.title, parts, stats: diffStats(parts) };
        })
      : [];
  const changed = rows.filter((r) => r.stats.changed);
  const showAll = sp.all === "1";

  return (
    <div>
      <PageHeader title="Phiên bản & so sánh báo cáo" description={`${report.cycle.program.code} · ${report.title}`} />
      <Card className="mb-5">
        <CardContent className="space-y-3">
          {report.versions.length === 0 ? (
            <p className="text-sm text-slate-500">
              Chưa chốt phiên bản nào. Vào trang báo cáo, bấm <b>Chốt phiên bản</b> để lưu ảnh chụp v1.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 text-sm">
              {report.versions.map((v) => (
                <span key={v.id} className="rounded-lg border border-slate-200 px-2.5 py-1">
                  <b>{v.label}</b> · {formatDateTime(v.createdAt)} · {v.createdBy?.fullName ?? "—"}
                  {v.note && <span className="text-slate-500"> — {v.note}</span>}
                </span>
              ))}
            </div>
          )}
          <form className="flex flex-wrap items-center gap-2 text-sm">
            So sánh
            <Select name="a" defaultValue={aKey ?? "current"} className="w-auto">
              {report.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
              <option value="current">Hiện tại</option>
            </Select>
            với
            <Select name="b" defaultValue={bKey} className="w-auto">
              {report.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
              <option value="current">Hiện tại</option>
            </Select>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <input type="checkbox" name="all" value="1" defaultChecked={showAll} /> hiện cả mục không đổi
            </label>
            <Button type="submit" size="sm" variant="outline">
              So sánh
            </Button>
            <Link href={`/reports/${id}`} className="ml-auto text-brand-600 hover:underline">
              ← Về báo cáo
            </Link>
          </form>
        </CardContent>
      </Card>

      {A && B && (
        <p className="mb-3 text-sm text-slate-600">
          {label(aKey)} → {label(bKey)}: <b>{changed.length}</b>/{rows.length} mục thay đổi. Nội dung <span className="rounded bg-red-100 px-1 line-through">bị xóa</span> và{" "}
          <span className="rounded bg-green-100 px-1">được thêm</span>.
        </p>
      )}
      <div className="space-y-3">
        {(showAll ? rows : changed).map((r, i) => (
          <Card key={i}>
            <CardContent>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{r.title}</span>
                {r.stats.changed ? (
                  <Badge color="amber">
                    +{r.stats.added} / −{r.stats.removed}
                  </Badge>
                ) : (
                  <Badge color="slate">không đổi</Badge>
                )}
              </div>
              <DiffView parts={r.parts} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
