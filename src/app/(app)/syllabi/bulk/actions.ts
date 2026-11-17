"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { canAccessProgram } from "@/lib/access";
import { programRolesOf } from "@/lib/program-context";
import { extractText } from "@/lib/ai/documents";
import { matchCourseInText } from "@/lib/import/syllabus-match";

/**
 * Find which course of the program a syllabus file belongs to, from its text
 * ("Mã học phần: LOG101", or the course code appearing near the top). Used for files whose
 * name carries no course code. Returns null when nothing matches.
 */
export async function findSyllabusCourseAction(programId: string, fd: FormData): Promise<{ courseId: string | null; error?: string }> {
  try {
    const user = await requireUser();
    if (!(await canAccessProgram(user, programId))) return { courseId: null, error: "Không có quyền với chương trình này." };
    if (!canInProgram(user.role, await programRolesOf(user.id, programId), "syllabus:write")) return { courseId: null, error: "Bạn không có quyền chỉnh sửa đề cương." };
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return { courseId: null, error: "Thiếu tệp." };
    const text = await extractText(Buffer.from(await file.arrayBuffer()), file.type, file.name);
    const courses = await prisma.course.findMany({ where: { programId }, select: { id: true, code: true, nameVi: true } });
    return { courseId: matchCourseInText(text, courses)?.id ?? null };
  } catch (e) {
    return { courseId: null, error: e instanceof Error ? e.message : "Không đọc được tệp." };
  }
}
