// Daily reminders (run by Cloud Scheduler → /api/cron/reminders):
//   - tasks due in 3 days / due today / overdue (overdue repeats weekly)
//   - SAR sections not done when the cycle target date is ≤ 14 days away
//   - evidence expiring within 60 days / expired
// ReminderLog keys make every reminder idempotent (safe to run more than once a day).
import { prisma } from "./db";
import { createNotification } from "./notify";
import { ReportSectionStatus, Role, TaskStatus } from "@/generated/prisma/enums";

const DAY = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - y.getTime()) / DAY + 1) / 7)}`;
}

async function once(key: string, userId: string, send: () => Promise<void>): Promise<boolean> {
  const exists = await prisma.reminderLog.findUnique({ where: { key } });
  if (exists) return false;
  await send();
  await prisma.reminderLog.create({ data: { key, userId } });
  return true;
}

export interface ReminderSummary {
  tasks: number;
  sections: number;
  evidence: number;
}

export async function runReminders(now = new Date()): Promise<ReminderSummary> {
  const sum: ReminderSummary = { tasks: 0, sections: 0, evidence: 0 };
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ---- Tasks ----
  const tasks = await prisma.task.findMany({
    where: { status: { not: TaskStatus.DONE }, dueDate: { not: null, lte: new Date(startToday.getTime() + 4 * DAY) } },
    select: { id: true, title: true, dueDate: true, assigneeId: true, createdById: true, programId: true },
  });
  for (const t of tasks) {
    const target = t.assigneeId ?? t.createdById;
    if (!target || !t.dueDate) continue;
    const days = Math.floor((t.dueDate.getTime() - startToday.getTime()) / DAY);
    let key: string | null = null;
    let title = "";
    if (days < 0) {
      key = `task:${t.id}:overdue:${isoWeek(now)}`;
      title = `Nhiệm vụ quá hạn ${-days} ngày`;
    } else if (days === 0) {
      key = `task:${t.id}:due0`;
      title = "Nhiệm vụ đến hạn hôm nay";
    } else if (days <= 3) {
      key = `task:${t.id}:due3`;
      title = `Nhiệm vụ còn ${days} ngày đến hạn`;
    }
    if (key && (await once(key, target, () => createNotification({ userId: target, title, message: t.title, link: `/tasks?program=${t.programId ?? ""}` })))) sum.tasks++;
  }

  // ---- SAR sections close to the cycle target date ----
  const sections = await prisma.reportSection.findMany({
    where: {
      status: { not: ReportSectionStatus.DONE },
      assignedToId: { not: null },
      report: { cycle: { targetDate: { gte: startToday, lte: new Date(startToday.getTime() + 14 * DAY) } } },
    },
    select: { id: true, title: true, assignedToId: true, reportId: true, report: { select: { cycle: { select: { targetDate: true } } } } },
  });
  for (const s of sections) {
    const uid = s.assignedToId!;
    const target = s.report.cycle.targetDate!;
    if (
      await once(`section:${s.id}:cycle14:${ymd(target)}`, uid, () =>
        createNotification({
          userId: uid,
          title: `Mục SAR chưa hoàn thành — hạn chu kỳ ${target.toLocaleDateString("vi-VN")}`,
          message: s.title.slice(0, 160),
          link: `/reports/${s.reportId}`,
        }),
      )
    )
      sum.sections++;
  }

  // ---- Evidence validity ----
  const qa = await prisma.user.findMany({ where: { role: Role.QA_OFFICE, isActive: true }, select: { id: true } });
  const evidence = await prisma.evidence.findMany({
    where: { validUntil: { not: null, lte: new Date(startToday.getTime() + 60 * DAY) } },
    select: { id: true, code: true, title: true, validUntil: true, uploadedById: true },
  });
  for (const e of evidence) {
    const expired = e.validUntil!.getTime() < startToday.getTime();
    const recipients = [...new Set([e.uploadedById, ...qa.map((q) => q.id)].filter((x): x is string => Boolean(x)))];
    for (const uid of recipients) {
      const key = `evidence:${e.id}:${expired ? "expired" : "exp60"}:${uid}`;
      if (
        await once(key, uid, () =>
          createNotification({
            userId: uid,
            title: expired ? `Minh chứng ${e.code} đã hết hiệu lực` : `Minh chứng ${e.code} sắp hết hiệu lực (${e.validUntil!.toLocaleDateString("vi-VN")})`,
            message: e.title,
            link: `/evidence/${e.id}`,
          }),
        )
      )
        sum.evidence++;
    }
  }
  return sum;
}
