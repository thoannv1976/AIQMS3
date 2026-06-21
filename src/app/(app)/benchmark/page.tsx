import { requireUser } from "@/lib/auth";
import { getBenchmark } from "@/lib/quality/benchmark";
import { aunRating } from "@/lib/quality/scoring";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Td, Th } from "@/components/ui";
import { StatCard, Progress } from "@/components/widgets";
import { BarChartCard } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function BenchmarkPage() {
  await requireUser();
  const rows = await getBenchmark();

  if (rows.length === 0) return <EmptyState title="Chưa có chương trình" />;

  const avgReadiness = Math.round(rows.reduce((s, r) => s + r.readiness, 0) / rows.length);
  const best = rows[0];
  const lowest = rows[rows.length - 1];

  return (
    <div>
      <PageHeader
        title="So sánh chương trình (Benchmark)"
        description="Đối sánh mức sẵn sàng kiểm định, đạt chuẩn đầu ra và độ mạnh minh chứng giữa các chương trình đào tạo."
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Số chương trình" value={rows.length} />
          <StatCard label="Sẵn sàng trung bình" value={`${avgReadiness}%`} accent={avgReadiness >= 55 ? "green" : "amber"} />
          <StatCard label="Cao nhất / thấp nhất" value={`${best.code} / ${lowest.code}`} accent="purple" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mức sẵn sàng kiểm định theo chương trình</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartCard
              data={rows.map((r) => ({ name: r.code, value: r.readiness }))}
              xKey="name"
              barKey="value"
              color="#2563eb"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bảng đối sánh chi tiết</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <Th>Chương trình</Th>
                    <Th>Sẵn sàng</Th>
                    <Th className="text-center">AUN-QA</Th>
                    <Th className="text-center">Tiêu chí có MC</Th>
                    <Th className="text-center">SAR</Th>
                    <Th className="text-center">Độ mạnh MC</Th>
                    <Th className="text-center">OBE TB</Th>
                    <Th className="text-right">Số MC</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const aun = aunRating(r.readiness);
                    return (
                      <tr key={r.programId} className="hover:bg-slate-50">
                        <Td>
                          <div className="font-medium text-slate-900">{r.code}</div>
                          <div className="text-xs text-slate-500">{r.nameVi}</div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="w-9 text-sm font-semibold text-slate-700">{r.readiness}%</span>
                            <div className="w-24">
                              <Progress value={r.readiness} />
                            </div>
                          </div>
                        </Td>
                        <Td className="text-center">
                          <Badge color={aun.color}>Mức {r.aunPoint}</Badge>
                        </Td>
                        <Td className="text-center text-sm">
                          {r.criteriaWithEvidence}/{r.criteriaTotal}
                        </Td>
                        <Td className="text-center text-sm">{r.sarDonePct}%</Td>
                        <Td className="text-center text-sm">{r.evidenceStrengthAvg}/100</Td>
                        <Td className="text-center text-sm">{r.obeAvg != null ? `${r.obeAvg}%` : "—"}</Td>
                        <Td className="text-right text-sm">{r.evidenceCount}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
