import Link from "next/link";
import { MessageSquareText, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveProgram } from "@/lib/program-context";
import { ProgramSwitcher } from "@/components/program-switcher";
import { Card, CardContent, PageHeader, Badge, EmptyState } from "@/components/ui";
import { surveyAudience, surveyStatus } from "@/lib/labels";

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

  return (
    <div>
      <PageHeader
        title="Khảo sát các bên liên quan"
        description="Khảo sát sinh viên, cựu sinh viên, giảng viên, nhà tuyển dụng; AI phân tích phản hồi mở"
        actions={<ProgramSwitcher programs={programs} selectedId={selected?.id} />}
      />

      {!selected ? (
        <EmptyState title="Chưa có chương trình" />
      ) : surveys.length === 0 ? (
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
  );
}
