"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProgram } from "@/lib/access";
import { isInstitutionWide } from "@/lib/rbac";
import { createNotification } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { Role } from "@/generated/prisma/enums";

export type CommentEntity = "report_section" | "evidence" | "improvement";

export interface CommentDto {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  resolved: boolean;
}

/** Program, link and people to notify for a commented entity (null when it does not exist). */
async function resolveEntity(type: CommentEntity, id: string): Promise<{ programId: string; link: string; title: string; owners: string[] } | null> {
  if (type === "report_section") {
    const s = await prisma.reportSection.findUnique({ where: { id }, select: { title: true, reportId: true, assignedToId: true, reviewerId: true, report: { select: { cycle: { select: { programId: true } } } } } });
    return s ? { programId: s.report.cycle.programId, link: `/reports/${s.reportId}`, title: s.title, owners: [s.assignedToId, s.reviewerId].filter((x): x is string => Boolean(x)) } : null;
  }
  if (type === "evidence") {
    const e = await prisma.evidence.findUnique({ where: { id }, select: { code: true, title: true, programId: true, uploadedById: true } });
    return e ? { programId: e.programId, link: `/evidence/${id}`, title: `${e.code} — ${e.title}`, owners: e.uploadedById ? [e.uploadedById] : [] } : null;
  }
  const p = await prisma.improvementPlan.findUnique({ where: { id }, select: { programId: true, problem: true } });
  return p ? { programId: p.programId, link: `/improvements?program=${p.programId}`, title: p.problem.slice(0, 80), owners: [] } : null;
}

async function guard(type: CommentEntity, id: string) {
  const user = await requireUser();
  if (user.role === Role.EXTERNAL_REVIEWER) throw new Error("Đánh giá viên ngoài không dùng trao đổi nội bộ.");
  const ent = await resolveEntity(type, id);
  if (!ent || !(await canAccessProgram(user, ent.programId))) throw new Error("Không có quyền.");
  return { user, ent };
}

export async function listCommentsAction(type: CommentEntity, id: string): Promise<CommentDto[]> {
  await guard(type, id);
  const rows = await prisma.comment.findMany({ where: { entityType: type, entityId: id }, orderBy: { createdAt: "asc" }, include: { author: { select: { fullName: true } } } });
  return rows.map((c) => ({ id: c.id, body: c.body, authorId: c.authorId, authorName: c.author?.fullName ?? "(đã xóa)", createdAt: c.createdAt.toISOString(), resolved: c.resolved }));
}

/** People who can be @mentioned: members of the program plus institution-wide staff. */
export async function mentionableUsersAction(type: CommentEntity, id: string): Promise<Array<{ id: string; name: string }>> {
  const { ent } = await guard(type, id);
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: Role.EXTERNAL_REVIEWER }, OR: [{ programRoles: { some: { programId: ent.programId } } }, { role: { in: [Role.ADMIN, Role.BOARD, Role.QA_OFFICE, Role.TRAINING_OFFICE] } }] },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, role: true },
  });
  return users.filter((u) => isInstitutionWide(u.role) || true).map((u) => ({ id: u.id, name: u.fullName }));
}

export async function addCommentAction(type: CommentEntity, id: string, body: string, mentionIds: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user, ent } = await guard(type, id);
    const text = body.trim().slice(0, 4000);
    if (!text) return { ok: false, error: "Nội dung trống." };
    // Only keep mentions whose name is still in the text and who can see the program.
    const allowed = new Set((await mentionableUsersAction(type, id)).map((u) => u.id));
    const named = await prisma.user.findMany({ where: { id: { in: mentionIds.filter((m) => allowed.has(m)) } }, select: { id: true, fullName: true } });
    const mentions = named.filter((u) => text.includes(`@${u.fullName}`)).map((u) => u.id);
    await prisma.comment.create({ data: { programId: ent.programId, entityType: type, entityId: id, authorId: user.id, body: text, mentions } });
    const snippet = text.length > 140 ? text.slice(0, 140) + "…" : text;
    const notified = new Set<string>([user.id]);
    for (const uid of mentions) {
      notified.add(uid);
      await createNotification({ userId: uid, title: `${user.fullName} nhắc đến bạn`, message: `${ent.title}: ${snippet}`, link: ent.link });
    }
    for (const uid of ent.owners) {
      if (notified.has(uid)) continue;
      notified.add(uid);
      await createNotification({ userId: uid, title: `Bình luận mới của ${user.fullName}`, message: `${ent.title}: ${snippet}`, link: ent.link });
    }
    await logAudit({ userId: user.id, action: "COMMENT", entityType: type, entityId: id, detail: { mentions: mentions.length } });
    revalidatePath(ent.link.split("?")[0]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi" };
  }
}

export async function setCommentResolvedAction(commentId: string, resolved: boolean): Promise<void> {
  const c = await prisma.comment.findUnique({ where: { id: commentId }, select: { entityType: true, entityId: true } });
  if (!c) return;
  await guard(c.entityType as CommentEntity, c.entityId);
  await prisma.comment.update({ where: { id: commentId }, data: { resolved } });
}

export async function deleteCommentAction(commentId: string): Promise<void> {
  const c = await prisma.comment.findUnique({ where: { id: commentId }, select: { entityType: true, entityId: true, authorId: true } });
  if (!c) return;
  const { user } = await guard(c.entityType as CommentEntity, c.entityId);
  if (c.authorId !== user.id && user.role !== Role.ADMIN) return;
  await prisma.comment.delete({ where: { id: commentId } });
}
