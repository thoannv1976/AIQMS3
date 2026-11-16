"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { canAccessProgram } from "@/lib/access";
import { programRolesOf } from "@/lib/program-context";
import { logAudit } from "@/lib/audit";
import { filesFrom } from "@/lib/import/sheet";
import { readSurveySheets, bestSheetIndex, answerSignature, answerLabel, type ImportQuestion, type SheetParse } from "@/lib/import/survey-responses";

const IMPORT_PREFIX = "Nhập từ ";

async function guard(surveyId: string) {
  const user = await requireUser();
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { id: true, programId: true, questions: { select: { id: true, text: true, type: true, order: true, options: true } } },
  });
  if (!survey || !(await canAccessProgram(user, survey.programId))) throw new Error("Không tìm thấy phiếu khảo sát.");
  if (!canInProgram(user.role, await programRolesOf(user.id, survey.programId), "survey:write")) throw new Error("Bạn cần quyền chỉnh sửa khảo sát.");
  if (!survey.questions.length) throw new Error("Phiếu chưa có câu hỏi.");
  return { user, survey, questions: survey.questions as ImportQuestion[] };
}

/** Parse the uploaded file and pick the requested sheet (default: the one that fits the survey best). */
async function load(surveyId: string, fd: FormData) {
  const ctx = await guard(surveyId);
  const file = (await filesFrom(fd, "file"))[0];
  if (!file) throw new Error("Chọn một tệp Excel (.xlsx) hoặc CSV.");
  const sheets = await readSurveySheets(file, ctx.questions);
  if (!sheets.length) throw new Error("Không tìm thấy bảng nào có tiêu đề cột khớp với câu hỏi của phiếu (cần ít nhất 2 cột khớp, ví dụ “Q1”, “Câu 1” hoặc nội dung câu hỏi).");
  const wanted = String(fd.get("sheet") ?? "");
  const idx = sheets.findIndex((s) => s.sheet === wanted);
  const sheet = sheets[idx >= 0 ? idx : bestSheetIndex(sheets)];

  const existing = await prisma.surveyResponse.findMany({
    where: { surveyId, OR: [{ clientKey: { startsWith: "import:" } }, { respondent: { startsWith: IMPORT_PREFIX } }] },
    select: { answers: { select: { questionId: true, valueNumber: true, valueText: true } } },
  });
  const existingSigs = new Set(existing.map((r) => answerSignature(r.answers)));
  return { ...ctx, file, sheets, sheet, existingSigs };
}

export interface ResponseImportPreview {
  fileName: string;
  sheets: Array<{ name: string; rows: number; matched: number }>;
  sheet: string;
  rowCount: number;
  importable: number;
  duplicates: number;
  columns: Array<{ header: string; question: string | null; via: "text" | "number" | null }>;
  unmatched: string[];
  missing: string[];
  issues: Array<{ row: number; level: "error" | "warning"; message: string }>;
  issuesTotal: number;
  sampleHeaders: string[];
  sample: Array<{ row: number; values: string[] }>;
}

export type ResponseImportPreviewResult = { ok: true; preview: ResponseImportPreview } | { ok: false; error: string };

function matchedCount(s: SheetParse) {
  return s.columns.filter((c) => c.questionIndex != null).length;
}

export async function previewResponseImportAction(surveyId: string, fd: FormData): Promise<ResponseImportPreviewResult> {
  try {
    const { file, sheets, sheet, existingSigs, questions } = await load(surveyId, fd);
    const qs = [...questions].sort((a, b) => a.order - b.order);
    const valid = sheet.rows.filter((r) => r.answers.length);
    const dup = valid.filter((r) => existingSigs.has(r.signature)).length;
    const issues = sheet.rows.flatMap((r) => r.issues.map((i) => ({ row: r.rowNumber, ...i })));
    const short = (t: string) => (t.length > 70 ? t.slice(0, 69) + "…" : t);
    return {
      ok: true,
      preview: {
        fileName: file.name,
        sheets: sheets.map((s) => ({ name: s.sheet, rows: s.rows.length, matched: matchedCount(s) })),
        sheet: sheet.sheet,
        rowCount: sheet.rows.length,
        importable: valid.length,
        duplicates: dup,
        columns: sheet.columns
          .filter((c) => c.header)
          .map((c) => ({ header: c.header, question: c.questionIndex != null ? `Câu ${c.questionIndex + 1}: ${short(qs[c.questionIndex].text)}` : null, via: c.via })),
        unmatched: sheet.unmatched,
        missing: sheet.missingQuestions.map((i) => `Câu ${i + 1}: ${short(qs[i].text)}`),
        issues: issues.slice(0, 200),
        issuesTotal: issues.length,
        sampleHeaders: qs.map((_, i) => `Câu ${i + 1}`),
        sample: valid.slice(0, 5).map((r) => ({ row: r.rowNumber, values: qs.map((q) => answerLabel(r.answers.find((a) => a.questionId === q.id))) })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi đọc tệp." };
  }
}

export async function applyResponseImportAction(
  surveyId: string,
  fd: FormData,
): Promise<{ ok: true; created: number; skippedDuplicates: number; skippedInvalid: number } | { ok: false; error: string }> {
  try {
    const { user, file, sheet, existingSigs } = await load(surveyId, fd);
    const skipDup = fd.get("skipDup") === "1";
    const valid = sheet.rows.filter((r) => r.answers.length);
    const rows = skipDup ? valid.filter((r) => !existingSigs.has(r.signature)) : valid;
    if (rows.length) {
      await prisma.$transaction(
        rows.map((r) =>
          prisma.surveyResponse.create({
            data: {
              surveyId,
              clientKey: `import:${r.signature}`,
              respondent: `${IMPORT_PREFIX}${file.name} #${r.index}`.slice(0, 190),
              answers: { create: r.answers.map((a) => ({ questionId: a.questionId, valueNumber: a.valueNumber, valueText: a.valueText })) },
            },
          }),
        ),
      );
    }
    const result = { created: rows.length, skippedDuplicates: valid.length - rows.length, skippedInvalid: sheet.rows.length - valid.length };
    await logAudit({
      userId: user.id,
      action: "IMPORT",
      entityType: "SurveyResponse",
      entityId: surveyId,
      detail: { file: file.name, sheet: sheet.sheet, rows: sheet.rows.length, skipDuplicates: skipDup, ...result },
    });
    revalidatePath(`/surveys/${surveyId}`);
    revalidatePath("/surveys");
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi nhập dữ liệu." };
  }
}
