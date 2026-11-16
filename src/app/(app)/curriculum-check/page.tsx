import { requireUser } from "@/lib/auth";
import { resolveProgram } from "@/lib/program-context";
import { getCurriculumReport, type IssueSeverity } from "@/lib/quality/curriculum";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { StatCard, Progress } from "@/components/widgets";
import type { BadgeColor } from "@/components/ui";
import { CurriculumReviewPanel } from "./CurriculumReviewPanel";

export const dynamic = "force-dynamic";

const SEVERITY_META: Record<IssueSeverity, { label: string; color: BadgeColor }> = {
  high: { label: "Nghiêm trọng", color: "red" },
  medium: { label: "Cần xử lý", color: "amber" },
  low: { label: "Lưu ý", color: "slate" },
};

const COVERAGE_LABELS: Array<{ key: keyof Awaited<ReturnType<typeof getCurriculumReport>>["coverage"]; label: string }> = [
  { key: "ploSupported", label: "PLO có học phần đóng góp (ma trận)" },
  { key: "ploMastered", label: "PLO đạt mức Mastered" },
  { key: "ploLinkedToClo", label: "PLO có CLO liên kết" },
  { key: "coursesWithClo", label: "Học phần đã khai báo CLO" },
  { key: "coursesWithAssessment", label: "Học phần có phương pháp đánh giá" },
  { key: "coursesWithRubric", label: "Học phần có rubric" },
];

export default async function CurriculumCheckPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);
  const report = selected ? await getCurriculumReport(selected.id) : null;

  return (
    <div>
      <PageHeader
        title="Kiểm tra logic chương trình đào tạo"
        description="Rà soát tự động tính nhất quán chuỗi PLO → CLO → Phương pháp đánh giá → Rubric (Constructive Alignment)."
        actions={<ProgramSwitcher programs={programs} selectedId={selected?.id} />}
      />

      {!report ? (
        <EmptyState title="Chưa có chương trình" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Chuẩn đầu ra (PLO)" value={report.ploCount} />
            <StatCard label="Học phần" value={report.courseCount} accent="purple" />
            <StatCard label="Chuẩn đầu ra học phần (CLO)" value={report.cloCount} accent="green" />
            <StatCard
              label="Vấn đề phát hiện"
              value={report.issues.length}
              accent={report.issues.length > 0 ? "amber" : "green"}
            />
          </div>

          <CurriculumReviewPanel programId={selected!.id} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Độ phủ liên kết</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {COVERAGE_LABELS.map(({ key, label }) => {
                  const v = report.coverage[key];
                  return (
                    <div key={key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-slate-600">{label}</span>
                        <span className="font-semibold text-slate-700">{v}%</span>
                      </div>
                      <Progress value={v} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Vấn đề về tính nhất quán</CardTitle>
                <Badge color={report.issues.length ? "amber" : "green"}>{report.issues.length}</Badge>
              </CardHeader>
              <CardContent>
                {report.issues.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Không phát hiện vấn đề theo các quy tắc kiểm tra tự động. Vẫn nên có rà soát chuyên môn của hội đồng.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {report.issues.map((iss, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Badge color={SEVERITY_META[iss.severity].color}>{SEVERITY_META[iss.severity].label}</Badge>
                        <span className="text-slate-700">{iss.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
