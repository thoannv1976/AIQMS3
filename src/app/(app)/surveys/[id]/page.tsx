import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader } from "@/components/ui";
import { surveyAudience, surveyStatus } from "@/lib/labels";
import { QuestionType } from "@/generated/prisma/enums";
import { AnalyzePanel } from "./AnalyzePanel";

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const survey = await prisma.survey.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" }, include: { answers: true } }, _count: { select: { responses: true } } },
  });
  if (!survey) notFound();

  const openAnswers: string[] = [];
  const likertStats = survey.questions
    .filter((q) => q.type === QuestionType.LIKERT)
    .map((q) => {
      const nums = q.answers.map((a) => a.valueNumber).filter((n): n is number => n != null);
      const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
      return { text: q.text, avg, count: nums.length };
    });
  survey.questions.forEach((q) => {
    if (q.type === QuestionType.OPEN) q.answers.forEach((a) => a.valueText && openAnswers.push(a.valueText));
  });

  return (
    <div>
      <PageHeader
        title={survey.title}
        description={`${survey._count.responses} phản hồi`}
        actions={
          <div className="flex gap-2">
            <Badge color={surveyAudience[survey.audience].color}>{surveyAudience[survey.audience].label}</Badge>
            <Badge color={surveyStatus[survey.status].color}>{surveyStatus[survey.status].label}</Badge>
          </div>
        }
      />

      <div className="space-y-6">
        <AnalyzePanel surveyId={survey.id} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Kết quả định lượng (Likert)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {likertStats.length === 0 && <p className="text-sm text-slate-500">Không có câu hỏi Likert.</p>}
              {likertStats.map((s, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">{s.text}</span>
                    <span className="font-medium text-slate-900">{s.avg.toFixed(2)}/5</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(s.avg / 5) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Phản hồi mở ({openAnswers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {openAnswers.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa có phản hồi mở.</p>
              ) : (
                <ul className="space-y-2">
                  {openAnswers.map((a, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      “{a}”
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
