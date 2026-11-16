"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { canAccessProgram } from "@/lib/access";
import { programRolesOf } from "@/lib/program-context";
import { logAudit } from "@/lib/audit";
import { extractText } from "@/lib/ai/documents";
import { CloPloStrength, SyllabusStatus } from "@/generated/prisma/enums";
import {
  SYLLABUS_FIELDS,
  aiRefineSyllabus,
  coerceSyllabus,
  normPloCode,
  parseSyllabusText,
  type ParsedClo,
  type SyllabusField,
  type SyllabusFields,
} from "@/lib/import/syllabus";

const MAX_BYTES = 10 * 1024 * 1024;

export interface SyllabusPreviewClo extends ParsedClo {
  status: "create" | "update";
  unknownPlos: string[];
}

export interface SyllabusImportPreview {
  fileName: string;
  fields: SyllabusFields;
  clos: SyllabusPreviewClo[];
  warnings: string[];
  ai: { used: boolean; model: string } | null;
  hasSyllabus: boolean;
  canWriteClos: boolean;
}

export type SyllabusPreviewResult = { ok: true; preview: SyllabusImportPreview } | { ok: false; error: string };

export interface SyllabusApplyResult {
  syllabus: "created" | "updated" | null;
  fieldsSaved: SyllabusField[];
  closCreated: number;
  closUpdated: number;
  links: number;
  warnings: string[];
}

async function guard(courseId: string) {
  const user = await requireUser();
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, code: true, programId: true, program: { select: { plos: { select: { id: true, code: true } } } } },
  });
  if (!course || !(await canAccessProgram(user, course.programId))) throw new Error("Không tìm thấy học phần.");
  const roles = await programRolesOf(user.id, course.programId);
  if (!canInProgram(user.role, roles, "syllabus:write")) throw new Error("Bạn không có quyền chỉnh sửa đề cương học phần này.");
  return { user, course, canWriteClos: canInProgram(user.role, roles, "outcome:write") };
}

const ploKey = (code: string) => normPloCode(code) ?? code.replace(/\s+/g, "").toUpperCase();

function ploIndex(plos: Array<{ id: string; code: string }>): Map<string, string> {
  return new Map(plos.map((p) => [ploKey(p.code), p.id]));
}

export async function previewSyllabusImportAction(courseId: string, fd: FormData): Promise<SyllabusPreviewResult> {
  try {
    const { user, course, canWriteClos } = await guard(courseId);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chọn một tệp Word (.docx)." };
    if (!file.name.toLowerCase().endsWith(".docx")) return { ok: false, error: "Chỉ hỗ trợ tệp Word định dạng .docx." };
    if (file.size > MAX_BYTES) return { ok: false, error: "Tệp vượt quá 10 MB." };

    const text = await extractText(Buffer.from(await file.arrayBuffer()), file.type, file.name);
    if (text.replace(/\s+/g, "").length < 50) return { ok: false, error: "Không đọc được nội dung từ tệp Word." };

    let parsed = parseSyllabusText(text);
    let ai: SyllabusImportPreview["ai"] = null;
    if (fd.get("useAi") === "1") {
      const r = await aiRefineSyllabus(text, parsed, user.id);
      parsed = r.result;
      ai = { used: !r.usedFallback, model: r.model };
    }

    const warnings: string[] = [];
    const foundFields = SYLLABUS_FIELDS.filter((f) => parsed.fields[f]);
    if (!foundFields.length && !parsed.clos.length) {
      return { ok: false, error: "Không nhận ra mục nào của đề cương (Mục tiêu, Nội dung, Đánh giá…). Kiểm tra lại tiêu đề các mục trong tệp." };
    }
    if (!parsed.clos.length) {
      warnings.push(parsed.cloSectionFound ? "Mục Chuẩn đầu ra học phần (CLO) không có CLO nào." : "Không tìm thấy mục Chuẩn đầu ra học phần (CLO).");
    }
    if (parsed.clos.length && !canWriteClos) warnings.push("Bạn không có quyền chỉnh sửa CLO — chỉ nội dung đề cương sẽ được lưu.");

    const plos = ploIndex(course.program.plos);
    const existing = new Set(
      (await prisma.clo.findMany({ where: { courseId }, select: { code: true } })).map((c) => c.code.toUpperCase()),
    );
    const clos: SyllabusPreviewClo[] = parsed.clos.map((c) => {
      const unknownPlos = c.plos.filter((p) => !plos.has(ploKey(p)));
      if (unknownPlos.length) warnings.push(`${c.code}: ${unknownPlos.join(", ")} không có trong chương trình — sẽ không được liên kết.`);
      if (!c.plos.length) warnings.push(`${c.code}: không tìm thấy PLO liên kết.`);
      return { ...c, status: existing.has(c.code) ? "update" : "create", unknownPlos };
    });
    const hasSyllabus = (await prisma.courseSyllabus.count({ where: { courseId } })) > 0;

    return { ok: true, preview: { fileName: file.name, fields: parsed.fields, clos, warnings, ai, hasSyllabus, canWriteClos } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi đọc tệp." };
  }
}

export async function applySyllabusImportAction(
  courseId: string,
  input: { fileName: string; fields: SyllabusFields; clos: ParsedClo[]; aiModel?: string | null },
): Promise<{ ok: true; result: SyllabusApplyResult } | { ok: false; error: string }> {
  try {
    const { user, course, canWriteClos } = await guard(courseId);
    // The preview comes back from the browser (possibly edited) — validate it again.
    const { fields, clos } = coerceSyllabus(input);
    const fieldsSaved = SYLLABUS_FIELDS.filter((f) => fields[f]);
    const closToSave = canWriteClos ? clos.filter((c) => c.description) : [];
    if (!fieldsSaved.length && !closToSave.length) return { ok: false, error: "Không có dữ liệu để áp dụng." };

    const plos = ploIndex(course.program.plos);
    const warnings: string[] = [];
    if (clos.length && !canWriteClos) warnings.push("Bỏ qua CLO do không có quyền chỉnh sửa chuẩn đầu ra.");
    for (const c of clos) if (canWriteClos && !c.description) warnings.push(`${c.code}: thiếu mô tả — bỏ qua.`);

    const result = await prisma.$transaction(async (tx) => {
      let syllabus: SyllabusApplyResult["syllabus"] = null;
      if (fieldsSaved.length) {
        // Only non-empty fields are written, so missing sections keep their current value.
        const data = Object.fromEntries(fieldsSaved.map((f) => [f, fields[f]])) as Partial<SyllabusFields>;
        const latest = await tx.courseSyllabus.findFirst({ where: { courseId }, orderBy: { createdAt: "desc" }, select: { id: true } });
        if (latest) {
          await tx.courseSyllabus.update({ where: { id: latest.id }, data });
          syllabus = "updated";
        } else {
          await tx.courseSyllabus.create({ data: { courseId, ...data, status: SyllabusStatus.DRAFT } });
          syllabus = "created";
        }
      }

      let closCreated = 0;
      let closUpdated = 0;
      let links = 0;
      if (closToSave.length) {
        const existing = new Set((await tx.clo.findMany({ where: { courseId }, select: { code: true } })).map((c) => c.code));
        for (const c of closToSave) {
          const clo = await tx.clo.upsert({
            where: { courseId_code: { courseId, code: c.code } },
            update: { description: c.description },
            create: { courseId, code: c.code, description: c.description },
            select: { id: true },
          });
          if (existing.has(c.code)) closUpdated++;
          else closCreated++;
          const strength = CloPloStrength[c.strength];
          for (const p of c.plos) {
            const ploId = plos.get(ploKey(p));
            if (!ploId) {
              warnings.push(`${c.code}: ${p} không có trong chương trình — không liên kết.`);
              continue;
            }
            await tx.cloPloLink.upsert({
              where: { cloId_ploId: { cloId: clo.id, ploId } },
              update: { strength },
              create: { cloId: clo.id, ploId, strength },
            });
            links++;
          }
        }
      }
      return { syllabus, fieldsSaved, closCreated, closUpdated, links, warnings };
    }, { timeout: 30_000 });

    await logAudit({
      userId: user.id,
      action: "IMPORT",
      entityType: "CourseSyllabus",
      entityId: courseId,
      detail: {
        source: "docx",
        fileName: String(input.fileName ?? "").slice(0, 200),
        courseCode: course.code,
        aiModel: input.aiModel ?? null,
        fields: result.fieldsSaved,
        syllabus: result.syllabus,
        closCreated: result.closCreated,
        closUpdated: result.closUpdated,
        links: result.links,
        warnings: result.warnings.slice(0, 50),
      },
    });
    revalidatePath(`/syllabi/${courseId}`);
    revalidatePath("/syllabi");
    revalidatePath("/curriculum-check");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi nhập đề cương." };
  }
}
