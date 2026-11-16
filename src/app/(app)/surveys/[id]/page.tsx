import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { FileSpreadsheet, Link2, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { programRolesOf } from "@/lib/program-context";
import { canAccessProgram } from "@/lib/access";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, Input, Select, Button, Textarea } from "@/components/ui";
import { surveyAudience, surveyStatus } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { QuestionType, SurveyStatus } from "@/generated/prisma/enums";
import { AnalyzePanel } from "./AnalyzePanel";
import { ResponseImport } from "./ResponseImport";
import { addQuestionAction, deleteQuestionAction, setSurveyStatusAction, updateSurveyScheduleAction } from "../manage-actions";

const TYPE_LABEL: Record<QuestionType, string> = {
  LIKERT: "Thang 1–5",
  OPEN: "Câu hỏi mở",
  SINGLE_CHOICE: "Một lựa chọn",
  MULTI_CHOICE: "Nhiều lựa chọn",
};
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const survey = await prisma.survey.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" }, include: { answers: true } },
      _count: { select: { responses: true } },
      criterion: { select: { code: true } },
    },
  });
  if (!survey || !(await canAccessProgram(user, survey.programId))) notFound();
  const canWrite = canInProgram(user.role, await programRolesOf(user.id, survey.programId), "survey:write");

  const cycle = await prisma.accreditationCycle.findFirst({
    where: { programId: survey.programId },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    include: { standardSet: { include: { standards: { orderBy: { order: "asc" }, include: { criteria: { orderBy: { order: "asc" } } } } } } },
  });
  const criteria = cycle ? cycle.standardSet.standards.flatMap((s) => s.criteria) : [];

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const publicUrl = survey.publicToken ? `${proto}://${host}/s/${survey.publicToken}` : null;
  const qr = publicUrl ? await QRCode.toDataURL(publicUrl, { margin: 1, width: 180 }) : null;

  const openAnswers: Array<{ q: string; a: string }> = [];
  const stats = survey.questions.map((q) => {
    if (q.type === QuestionType.LIKERT) {
      const nums = q.answers.map((a) => a.valueNumber).filter((n): n is number => n != null);
      const dist = [1, 2, 3, 4, 5].map((v) => nums.filter((n) => n === v).length);
      return { q, kind: "likert" as const, avg: nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0, n: nums.length, dist };
    }
    if (q.type === QuestionType.OPEN) {
      q.answers.forEach((a) => a.valueText && openAnswers.push({ q: q.text, a: a.valueText }));
      return { q, kind: "open" as const, n: q.answers.length };
    }
    const counts = new Map<string, number>();
    q.answers.forEach((a) => (a.valueText ?? "").split(";").map((x) => x.trim()).filter(Boolean).forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1)));
    return { q, kind: "choice" as const, n: q.answers.length, counts: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
  });

  return (
    <div>
      <PageHeader
        title={survey.title}
        description={`${survey._count.responses} phản hồi${survey.criterion ? ` · gắn tiêu chí ${survey.criterion.code}` : ""}${survey.closesAt ? ` · đóng ngày ${formatDate(survey.closesAt)}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={surveyAudience[survey.audience].color}>{surveyAudience[survey.audience].label}</Badge>
            <Badge color={surveyStatus[survey.status].color}>{surveyStatus[survey.status].label}</Badge>
            {survey._count.responses > 0 && (
              <a
                href={`/surveys/${survey.id}/export`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-4 w-4" /> Xuất Excel
              </a>
            )}
          </div>
        }
      />

      <div className="space-y-6">
        {canWrite && (
          <Card>
            <CardHeader>
              <CardTitle>Phát phiếu</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-start gap-6">
              <div className="min-w-72 flex-1 space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  {survey.status !== SurveyStatus.OPEN && (
                    <form action={setSurveyStatusAction.bind(null, survey.id, SurveyStatus.OPEN)}>
                      <Button type="submit" size="sm" disabled={survey.questions.length === 0}>
                        {survey.status === SurveyStatus.CLOSED ? "Mở lại phiếu" : "Mở phiếu & tạo link công khai"}
                      </Button>
                    </form>
                  )}
                  {survey.status === SurveyStatus.OPEN && (
                    <form action={setSurveyStatusAction.bind(null, survey.id, SurveyStatus.CLOSED)}>
                      <Button type="submit" size="sm" variant="outline">
                        Đóng phiếu
                      </Button>
                    </form>
                  )}
                </div>
                {publicUrl ? (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                      <Link2 className="h-3.5 w-3.5" /> Link công khai (không cần đăng nhập)
                    </div>
                    <a href={publicUrl} target="_blank" className="break-all font-medium text-brand-700 hover:underline">
                      {publicUrl}
                    </a>
                    <p className="mt-1 text-xs text-slate-500">Mỗi trình duyệt chỉ gửi được một phản hồi. {survey.status !== SurveyStatus.OPEN && "Phiếu đang đóng — link tạm không nhận phản hồi."}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Bấm “Mở phiếu” để tạo link công khai và mã QR phát cho người trả lời.</p>
                )}
                <form action={updateSurveyScheduleAction.bind(null, survey.id)} className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-500">
                    Mở từ
                    <Input type="date" name="opensAt" defaultValue={iso(survey.opensAt)} className="h-8 w-36" />
                  </label>
                  <label className="text-xs text-slate-500">
                    Đóng ngày
                    <Input type="date" name="closesAt" defaultValue={iso(survey.closesAt)} className="h-8 w-36" />
                  </label>
                  <label className="text-xs text-slate-500">
                    Tiêu chí
                    <Select name="criterionId" defaultValue={survey.criterionId ?? ""} className="h-8 w-28 text-xs">
                      <option value="">—</option>
                      {criteria.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button type="submit" size="sm" variant="outline">
                    Lưu lịch
                  </Button>
                </form>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr && <img src={qr} alt="Mã QR phiếu khảo sát" className="h-44 w-44 rounded-lg border border-slate-200" />}
            </CardContent>
          </Card>
        )}

        {canWrite && survey.questions.length > 0 && <ResponseImport surveyId={survey.id} />}

        <AnalyzePanel surveyId={survey.id} programId={survey.programId} criterionId={survey.criterionId} canWrite={canWrite} />

        <Card>
          <CardHeader>
            <CardTitle>Câu hỏi & kết quả ({survey.questions.length} câu · {survey._count.responses} phản hồi)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.map((s, i) => (
              <div key={s.q.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-slate-800">
                    {i + 1}. {s.q.text} <span className="text-xs font-normal text-slate-400">({TYPE_LABEL[s.q.type]} · {s.n} trả lời)</span>
                  </div>
                  {canWrite && survey._count.responses === 0 && (
                    <form action={deleteQuestionAction.bind(null, survey.id, s.q.id)}>
                      <button type="submit" title="Xóa câu hỏi" className="text-slate-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  )}
                </div>
                {s.kind === "likert" && s.n > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 text-sm">
                      Trung bình <b>{s.avg.toFixed(2)}</b>/5
                    </div>
                    <div className="flex h-5 w-full overflow-hidden rounded bg-slate-100 text-[10px] text-white">
                      {s.dist.map((c, k) =>
                        c ? (
                          <div key={k} style={{ width: `${(c / s.n) * 100}%` }} className={["bg-red-500", "bg-orange-400", "bg-slate-400", "bg-green-500", "bg-green-700"][k] + " flex items-center justify-center"}>
                            {k + 1}:{c}
                          </div>
                        ) : null,
                      )}
                    </div>
                  </div>
                )}
                {s.kind === "choice" && s.counts.length > 0 && (
                  <div className="mt-2 space-y-1 text-sm">
                    {s.counts.map(([opt, c]) => (
                      <div key={opt} className="flex items-center gap-2">
                        <span className="w-48 truncate text-slate-600">{opt}</span>
                        <div className="h-2 flex-1 rounded bg-slate-100">
                          <div className="h-2 rounded bg-brand-500" style={{ width: `${(c / s.n) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right text-slate-700">{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {canWrite && survey._count.responses === 0 && (
              <form action={addQuestionAction.bind(null, survey.id)} className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
                <div className="flex flex-wrap gap-2">
                  <Input name="text" placeholder="Nội dung câu hỏi" className="min-w-64 flex-1" required />
                  <Select name="type" defaultValue="LIKERT" className="w-auto">
                    {Object.entries(TYPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm">
                    Thêm câu hỏi
                  </Button>
                </div>
                <Textarea name="options" rows={2} placeholder="Các lựa chọn (mỗi dòng một lựa chọn) — chỉ cho câu một/nhiều lựa chọn" />
              </form>
            )}
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
                    “{a.a}” <span className="text-xs text-slate-400">— {a.q}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Link href={`/surveys?program=${survey.programId}`} className="text-sm text-brand-600 hover:underline">
          ← Về danh sách khảo sát
        </Link>
      </div>
    </div>
  );
}
