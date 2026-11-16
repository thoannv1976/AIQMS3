// AI spending limits: monthly / daily (whole system) and daily per user, with a warning threshold.
// Spend is read from AiUsageLog (successful real calls). A short in-process cache keeps this cheap.
import { prisma } from "../db";
import { createNotification } from "../notify";
import type { BudgetConfig } from "./config";

const VN_OFFSET_MS = 7 * 3600 * 1000;

/** Start of the current day / month in Vietnam time, as UTC instants. */
export function periodStarts(now = new Date()) {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const day = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS);
  const month = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - VN_OFFSET_MS);
  return { day, month, dayKey: vn.toISOString().slice(0, 10), monthKey: vn.toISOString().slice(0, 7) };
}

async function sumSince(from: Date, userId?: string): Promise<number> {
  const r = await prisma.aiUsageLog.aggregate({
    where: { createdAt: { gte: from }, usedFallback: false, ...(userId ? { userId } : {}) },
    _sum: { costUsd: true },
  });
  return r._sum.costUsd ?? 0;
}

let cache: { at: number; month: number; day: number } | null = null;
export function invalidateSpendCache() {
  cache = null;
}

export async function currentSpend(): Promise<{ month: number; day: number }> {
  if (cache && Date.now() - cache.at < 15_000) return cache;
  const { day, month } = periodStarts();
  const [m, d] = await Promise.all([sumSince(month), sumSince(day)]);
  cache = { at: Date.now(), month: m, day: d };
  return cache;
}

export interface BudgetDecision {
  ok: boolean;
  reason?: string;
}

/** Can a call costing about `estUsd` go ahead under the configured limits? */
export async function checkBudget(budget: BudgetConfig, estUsd: number, userId?: string | null): Promise<BudgetDecision> {
  const spend = await currentSpend();
  if (budget.monthlyUsd != null && spend.month + estUsd > budget.monthlyUsd) {
    return { ok: false, reason: `Đã đạt hạn mức chi phí AI tháng này ($${spend.month.toFixed(2)} / $${budget.monthlyUsd}). Liên hệ Quản trị hệ thống để nâng hạn mức.` };
  }
  if (budget.dailyUsd != null && spend.day + estUsd > budget.dailyUsd) {
    return { ok: false, reason: `Đã đạt hạn mức chi phí AI hôm nay ($${spend.day.toFixed(2)} / $${budget.dailyUsd}). AI hoạt động lại vào ngày mai hoặc khi Quản trị nâng hạn mức.` };
  }
  if (userId && budget.perUserDailyUsd != null) {
    const mine = await sumSince(periodStarts().day, userId);
    if (mine + estUsd > budget.perUserDailyUsd) {
      return { ok: false, reason: `Bạn đã dùng hết hạn mức AI cá nhân hôm nay ($${mine.toFixed(2)} / $${budget.perUserDailyUsd}).` };
    }
  }
  return { ok: true };
}

/** After a call: notify admins once per period when spend crosses the warning threshold. */
export async function maybeWarn(budget: BudgetConfig): Promise<void> {
  invalidateSpendCache();
  const spend = await currentSpend();
  const { dayKey, monthKey } = periodStarts();
  const flags: Array<{ key: string; label: string; spent: number; limit: number | null }> = [
    { key: `m:${monthKey}`, label: "tháng này", spent: spend.month, limit: budget.monthlyUsd },
    { key: `d:${dayKey}`, label: "hôm nay", spent: spend.day, limit: budget.dailyUsd },
  ];
  for (const f of flags) {
    if (f.limit == null || f.limit <= 0 || f.spent < f.limit * budget.warnPct) continue;
    const settingKey = `ai.budgetWarned.${f.key}`;
    if (await prisma.appSetting.findUnique({ where: { key: settingKey } })) continue;
    await prisma.appSetting.create({ data: { key: settingKey, value: { at: new Date().toISOString() } } }).catch(() => null);
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
    const pct = Math.round((f.spent / f.limit) * 100);
    for (const a of admins) {
      await createNotification({
        userId: a.id,
        title: `Chi phí AI ${f.label} đã đạt ${pct}% hạn mức`,
        message: `$${f.spent.toFixed(2)} / $${f.limit}. Khi chạm 100%, hệ thống sẽ tạm dừng gọi AI.`,
        link: "/admin/ai-config",
      });
    }
  }
}
