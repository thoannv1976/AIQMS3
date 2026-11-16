import Link from "next/link";
import { MessageSquareText, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveProgram } from "@/lib/program-context";
import { getSurveyAnalytics } from "@/lib/quality/surveys";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, Badge, EmptyState, Th, Td } from "@/components/ui";
import { StatCard } from "@/components/widgets";
import { BarChartCard, LineChartCard } from "@/components/charts";
import { surveyAudience, surveyStatus } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function SurveysPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);

  const surveys = selected
    ? await prisma.survey.findMany({
        where: { programId: selected.id },
        include: { _count: { select: { responses: true, questions: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const analytics = selected ? await getSurveyAnalytics(selected.id) : null;

  return (
    <div>
      <PageHeader
        title="Khảo sát các bên liên quan"
        description="Khảo sát sinh viên, cựu sinh viên, giảng viên, nhà tuyển dụng; so sánh các bên, xu hướng hài lòng và AI phân tích phản hồi"
        actions={<ProgramSwitcher programs={programs} selectedId={selected?.id} />}
      />

      {!selected ? (
        <EmptyState title="Chưa có chương trình" />
      ) : (
        <div className="space-y-6">
          {analytics?.hasLikert && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Số khảo sát" value={analytics.totalSurveys} />
                <StatCard label="Lượt phản hồi (Likert)" value={analytics.totalResponses} accent="purple" />
                <StatCard
                  label="Hài lòng trung bình"
                  value={`${analytics.overallAvg}/5`}
                  accent={analytics.overallAvg >= 3.5 ? "green" : "amber"}
                />
              </div>

              {(analytics.lowestAudience || analytics.trendDelta != null) && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                  {analytics.trendDelta != null && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      {analytics.trendDelta >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                      Xu hướng {analytics.trendDelta >= 0 ? "tăng" : "giảm"} {Math.abs(analytics.trendDelta)} điểm qua các năm.
                    </span>
                  )}
                  {analytics.lowestAudience && (
                    <span className="text-slate-600">
                      Nhóm cần quan tâm nhất:{" "}
                      <span className="font-medium text-slate-800">
                        {surveyAudience[analytics.lowestAudience.audience].label}
                      </span>{" "}
                      ({analytics.lowestAudience.avg}/5).
                    </span>
                  )}
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>So sánh hài lòng giữa các bên liên quan</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarChartCard
                      data={analytics.byAudience.map((a) => ({ name: surveyAudience[a.audience].label, value: a.avg }))}
                      xKey="name"
                      barKey="value"
                      color="#9333ea"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Xu hướng hài lòng qua các năm</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.hasMultiplePeriods ? (
                      <LineChartCard
                        data={analytics.byAudiencePeriod}
                        xKey="period"
                        domainMax={5}
                        refLine={{ y: 3.5, label: "Ngưỡng hài lòng" }}
                        lines={analytics.audiencesPresent.map((aud) => ({
                          key: aud,
                          name: surveyAudience[aud].label,
                        }))}
                      />
                    ) : (
                      <p className="py-12 text-center text-sm text-slate-500">
                        Cần dữ liệu khảo sát của ít nhất 2 năm để vẽ xu hướng.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Chi tiết theo nhóm đối tượng</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead className="border-b border-slate-100 bg-slate-50">
                      <tr>
                        <Th>Đối tượng</Th>
                        <Th className="text-right">Hài lòng TB</Th>
                        <Th className="text-right">Lượt phản hồi</Th>
                        <Th className="text-right">Số khảo sát</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analytics.byAudience.map((a) => (
                        <tr key={a.audience}>
                          <Td>
                            <Badge color={surveyAudience[a.audience].color}>{surveyAudience[a.audience].label}</Badge>
                          </Td>
                          <Td className="text-right font-semibold">
                            <span className={a.avg >= 3.5 ? "text-green-600" : "text-amber-600"}>{a.avg}/5</span>
                          </Td>
                          <Td className="text-right">{a.responses}</Td>
                          <Td className="text-right">{a.surveys}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Danh sách khảo sát</h2>
            {surveys.length === 0 ? (
              <EmptyState title="Chưa có khảo sát" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {surveys.map((s) => (
                  <Link key={s.id} href={`/surveys/${s.id}`}>
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardContent>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-2">
                            <MessageSquareText className="mt-0.5 h-5 w-5 text-brand-500" />
                            <div>
                              <h3 className="font-semibold text-slate-900">{s.title}</h3>
                              <div className="mt-1 flex gap-2">
                                <Badge color={surveyAudience[s.audience].color}>{surveyAudience[s.audience].label}</Badge>
                                <Badge color={surveyStatus[s.status].color}>{surveyStatus[s.status].label}</Badge>
                              </div>
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="mt-3 flex gap-4 text-xs text-slate-500">
                          <span>{s._count.questions} câu hỏi</span>
                          <span>{s._count.responses} phản hồi</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
