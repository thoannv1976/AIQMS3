import { AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveProgram } from "@/lib/program-context";
import { getObeTrends, type TrendDirection } from "@/lib/quality/trends";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, EmptyState, Th, Td } from "@/components/ui";
import { BarChartCard, LineChartCard } from "@/components/charts";

function TrendBadge({ direction, delta }: { direction: TrendDirection; delta: number | null }) {
  if (direction === "up")
    return (
      <Badge color="green">
        <TrendingUp className="mr-1 h-3 w-3" /> +{delta}đ
      </Badge>
    );
  if (direction === "down")
    return (
      <Badge color="red">
        <TrendingDown className="mr-1 h-3 w-3" /> {delta}đ
      </Badge>
    );
  if (direction === "flat")
    return (
      <Badge color="slate">
        <Minus className="mr-1 h-3 w-3" /> Ổn định
      </Badge>
    );
  return <span className="text-slate-300">—</span>;
}

export default async function ObePage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);

  const rows = selected
    ? await prisma.outcomeAssessment.findMany({ where: { programId: selected.id }, orderBy: { ploCode: "asc" } })
    : [];
  const trends = selected ? await getObeTrends(selected.id) : null;

  const chartData = rows.map((r) => ({ name: r.ploCode ?? "?", value: Math.round(r.achievedRate) }));
  const below = rows.filter((r) => r.achievedRate < r.threshold);

  return (
    <div>
      <PageHeader
        title="Đánh giá mức độ đạt chuẩn đầu ra (OBE)"
        description="Tổng hợp tỷ lệ đạt PLO/CLO theo khóa, học kỳ; phát hiện chuẩn đầu ra đạt thấp"
        actions={<ProgramSwitcher programs={programs} selectedId={selected?.id} />}
      />

      {!selected ? (
        <EmptyState title="Chưa có chương trình" />
      ) : rows.length === 0 ? (
        <EmptyState title="Chưa có dữ liệu đánh giá chuẩn đầu ra" />
      ) : (
        <div className="space-y-6">
          {below.length > 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Cảnh báo: {below.length} chuẩn đầu ra đạt dưới ngưỡng.</p>
                <p className="mt-0.5">
                  Cần ưu tiên cải tiến: {below.map((b) => `${b.ploCode} (${Math.round(b.achievedRate)}%)`).join(", ")}.
                  Hãy tạo kế hoạch cải tiến PDCA tương ứng.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <CheckCircle2 className="h-5 w-5" /> Tất cả chuẩn đầu ra đều đạt ngưỡng mục tiêu.
            </div>
          )}

          {/* Multi-period trend analysis */}
          {trends && trends.hasMultiplePeriods ? (
            <>
              {(trends.improving.length > 0 || trends.declining.length > 0) && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                  <span className="font-medium text-slate-700">Xu hướng qua {trends.periods.length} kỳ: </span>
                  {trends.improving.length > 0 && (
                    <span className="text-green-700">cải thiện ở {trends.improving.join(", ")}. </span>
                  )}
                  {trends.declining.length > 0 && (
                    <span className="text-red-700">suy giảm ở {trends.declining.join(", ")}. </span>
                  )}
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Xu hướng tỷ lệ đạt trung bình qua các kỳ</CardTitle>
                </CardHeader>
                <CardContent>
                  <LineChartCard
                    data={trends.periodSummary.map((p) => ({ period: p.period, avg: p.avgRate }))}
                    xKey="period"
                    lines={[{ key: "avg", name: "Tỷ lệ đạt TB (%)", color: "#2563eb" }]}
                    refLine={{ y: trends.threshold, label: `Ngưỡng ${trends.threshold}%` }}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Diễn biến theo từng PLO qua các kỳ</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-slate-100 bg-slate-50">
                        <tr>
                          <Th>PLO</Th>
                          {trends.periods.map((p) => (
                            <Th key={p} className="text-center">
                              {p}
                            </Th>
                          ))}
                          <Th className="text-center">Xu hướng</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {trends.ploTrends.map((t) => (
                          <tr key={t.ploCode}>
                            <Td className="font-medium">{t.ploCode}</Td>
                            {trends.periods.map((p) => {
                              const v = t.byPeriod[p];
                              return (
                                <Td key={p} className="text-center">
                                  {v == null ? (
                                    <span className="text-slate-300">—</span>
                                  ) : (
                                    <span className={v < trends.threshold ? "font-medium text-red-600" : "text-slate-700"}>
                                      {v}%
                                    </span>
                                  )}
                                </Td>
                              );
                            })}
                            <Td className="text-center">
                              <TrendBadge direction={t.direction} delta={t.delta} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
              Cần dữ liệu đánh giá của ít nhất 2 kỳ/khóa để phân tích xu hướng đa chu kỳ.
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Tỷ lệ đạt PLO (%)</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChartCard data={chartData} xKey="name" barKey="value" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chi tiết</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <Th>PLO</Th>
                    <Th>Khóa / Học kỳ</Th>
                    <Th>Tỷ lệ đạt</Th>
                    <Th>Ngưỡng</Th>
                    <Th>Cỡ mẫu</Th>
                    <Th>Đánh giá</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const ok = r.achievedRate >= r.threshold;
                    return (
                      <tr key={r.id}>
                        <Td className="font-medium">{r.ploCode}</Td>
                        <Td className="text-slate-500">{r.cohort} · {r.semester}</Td>
                        <Td className="font-semibold">{Math.round(r.achievedRate)}%</Td>
                        <Td>{Math.round(r.threshold)}%</Td>
                        <Td>{r.sampleSize ?? "—"}</Td>
                        <Td>
                          <Badge color={ok ? "green" : "red"}>{ok ? "Đạt" : "Chưa đạt"}</Badge>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
