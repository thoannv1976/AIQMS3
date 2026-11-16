import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProgram } from "@/lib/access";

/** Raw responses as Excel: one row per response, one column per question. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const survey = await prisma.survey.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } }, responses: { orderBy: { submittedAt: "asc" }, include: { answers: true } } },
  });
  if (!survey || !(await canAccessProgram(user, survey.programId))) return new Response("Không tìm thấy khảo sát.", { status: 404 });

  const rows = survey.responses.map((r, i) => {
    const row: Record<string, string | number> = { STT: i + 1, "Thời gian": r.submittedAt.toISOString().replace("T", " ").slice(0, 16) };
    survey.questions.forEach((q, qi) => {
      const a = r.answers.find((x) => x.questionId === q.id);
      row[`C${qi + 1}. ${q.text}`.slice(0, 120)] = a?.valueNumber ?? a?.valueText ?? "";
    });
    return row;
  });
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Phan hoi");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="khao-sat-${id}.xlsx"`,
    },
  });
}
