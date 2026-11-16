import { requireUser } from "@/lib/auth";
import { resolveProgram } from "@/lib/program-context";
import { getReadinessReport, BAND_META } from "@/lib/quality/scoring";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { StatCard, Progress } from "@/components/widgets";
import { evidenceStatus, reportSectionStatus } from "@/lib/labels";
import { GapAnalysisPanel } from "./GapAnalysisPanel";

export const dynamic = "force-dynamic";

export default async function ReadinessPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);
  const report = selected ? await getReadinessReport(selected.id) : null;

  return (
    <div>
      <PageHeader
        title="Mức độ sẵn sàng kiểm định"
        description="Điểm sẵn sàng theo tiêu chí, độ mạnh minh chứng và xếp hạng AUN-QA 7 mức — kèm AI phân tích khoảng trống."
        actions={<ProgramSwitcher programs={programs} selectedId={selected?.id} />}
      />

      {!report ? (
        <EmptyState
          title="Chưa có chu kỳ kiểm định"
          description="Hãy tạo chu kỳ kiểm định và gắn bộ tiêu chuẩn cho chương trình để tính mức độ sẵn sàng."
        />
      ) : (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Điểm sẵn sàng tổng thể"
              value={`${report.overall}%`}
              hint={`${report.cycleName}`}
              accent={report.aun.passed ? "green" : "amber"}
            />
            <StatCard label="Xếp hạng AUN-QA" value={`Mức ${report.aun.point}/7`} hint={report.aun.label} accent="purple" />
            <StatCard
              label="Tiêu chí có minh chứng"
              value={`${report.totals.withEvidence}/${report.totals.criteria}`}
              hint={`${report.totals.withApproved} tiêu chí đã có MC duyệt`}
            />
            <StatCard
              label="Mục SAR hoàn thành"
              value={`${report.totals.sarDone}/${report.totals.criteria}`}
              hint={report.totals.overdueTasks > 0 ? `${report.totals.overdueTasks} việc quá hạn` : "Không có việc quá hạn"}
              accent={report.totals.overdueTasks > 0 ? "red" : "green"}
            />
          </div>

          {/* Readiness hero + evidence strength distribution */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Chỉ số sẵn sàng kiểm định (Accreditation Readiness Score)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4">
                  <div className="text-5xl font-bold text-slate-900">{report.overall}</div>
                  <div className="pb-1">
                    <Badge color={report.aun.color}>
                      AUN-QA mức {report.aun.point}/7 — {report.aun.label}
                    </Badge>
                    <div className="mt-1 text-xs text-slate-500">
                      {report.aun.passed
                        ? "Đạt ngưỡng kỳ vọng (≥ mức 4)."
                        : "Chưa đạt ngưỡng kỳ vọng (mức 4). Cần bổ sung minh chứng & hoàn thiện SAR."}
                    </div>
                  </div>
                </div>
                <Progress className="mt-4" value={report.overall} />
                <p className="mt-3 text-xs text-slate-500">
                  Bộ tiêu chuẩn: {report.standardSetName}. Điểm tổng hợp từ độ mạnh minh chứng (50%), phê duyệt (20%) và
                  tiến độ báo cáo tự đánh giá (30%) trên {report.totals.criteria} tiêu chí.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Phân bố độ mạnh minh chứng</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.evidenceBands.total === 0 ? (
                  <p className="text-sm text-slate-500">Chưa có minh chứng được liên kết.</p>
                ) : (
                  (["strong", "adequate", "weak", "missing"] as const).map((b) => {
                    const n = report.evidenceBands[b];
                    const pctVal = Math.round((n / report.evidenceBands.total) * 100);
                    return (
                      <div key={b}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <Badge color={BAND_META[b].color}>{BAND_META[b].label}</Badge>
                          <span className="text-slate-500">
                            {n} ({pctVal}%)
                          </span>
                        </div>
                        <Progress value={pctVal} />
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Per-standard breakdown */}
          {report.standards.map((std) => (
            <Card key={std.id}>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  Tiêu chuẩn {std.code}. {std.title}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">{std.avgScore}%</span>
                  <Badge color={std.aun.color}>AUN mức {std.aun.point}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {std.criteria.map((c) => (
                  <div key={c.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Badge color="blue">{c.code}</Badge>
                        <span className="text-sm font-medium text-slate-800">{c.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">{c.score}%</span>
                        <Badge color={BAND_META[c.band].color}>{BAND_META[c.band].label}</Badge>
                      </div>
                    </div>

                    <Progress className="mt-2" value={c.score} />

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        Minh chứng: <span className="font-medium text-slate-700">{c.evidenceCount}</span>
                        {c.approvedCount > 0 && <span className="text-green-600"> ({c.approvedCount} đã duyệt)</span>}
                      </span>
                      {c.evidenceCount > 0 && (
                        <span>
                          Độ mạnh TB:{" "}
                          <Badge color={BAND_META[c.band === "missing" ? "weak" : c.band].color}>
                            {c.avgEvidenceStrength}/100
                          </Badge>
                        </span>
                      )}
                      <span>
                        SAR:{" "}
                        <span className="font-medium text-slate-700">
                          {c.sarStatus ? reportSectionStatus[c.sarStatus].label : "Chưa có"}
                        </span>
                      </span>
                    </div>

                    {c.evidence.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.evidence.map((e) => (
                          <span
                            key={e.id}
                            title={`${e.title} · ${evidenceStatus[e.status].label} · độ mạnh ${e.score}/100`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600"
                          >
                            <span className="font-medium">{e.code}</span>
                            <Badge color={BAND_META[e.band].color}>{e.score}</Badge>
                          </span>
                        ))}
                      </div>
                    )}

                    {c.gaps.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {c.gaps.map((g, i) => (
                          <li key={i} className="text-xs text-amber-700">
                            • {g}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-3">
                      <GapAnalysisPanel programId={selected!.id} criterionId={c.id} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
