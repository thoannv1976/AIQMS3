import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SurveyStatus } from "@/generated/prisma/enums";
import { PublicSurveyForm } from "./PublicSurveyForm";

export const dynamic = "force-dynamic";

export default async function PublicSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await prisma.survey.findUnique({
    where: { publicToken: token },
    include: { questions: { orderBy: { order: "asc" } }, program: { select: { code: true, nameVi: true } } },
  });
  if (!survey) notFound();
  const now = new Date();
  const key = (await cookies()).get(`aiqms_sv_${survey.id}`)?.value;
  const answered = key ? !!(await prisma.surveyResponse.findFirst({ where: { surveyId: survey.id, clientKey: key }, select: { id: true } })) : false;
  const open = survey.status === SurveyStatus.OPEN && !(survey.opensAt && survey.opensAt > now) && !(survey.closesAt && survey.closesAt < now);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 rounded-2xl bg-brand-600 px-6 py-5 text-white">
          <div className="text-xs uppercase tracking-wide opacity-80">
            Khảo sát · {survey.program.code} — {survey.program.nameVi}
          </div>
          <h1 className="mt-1 text-xl font-bold">{survey.title}</h1>
          {survey.description && <p className="mt-2 text-sm opacity-90">{survey.description}</p>}
        </div>
        {answered ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center text-green-800">Bạn đã gửi phản hồi cho phiếu này. Cảm ơn bạn!</div>
        ) : !open ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600">Phiếu khảo sát hiện chưa mở hoặc đã đóng. Cảm ơn bạn đã quan tâm.</div>
        ) : (
          <PublicSurveyForm
            token={token}
            questions={survey.questions.map((q) => ({ id: q.id, text: q.text, type: q.type, options: (q.options as string[] | null) ?? [] }))}
          />
        )}
        <p className="mt-6 text-center text-xs text-slate-400">Phản hồi được thu thập ẩn danh, chỉ dùng cho công tác đảm bảo chất lượng chương trình đào tạo.</p>
      </div>
    </div>
  );
}
