"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { getAiConfig, updateAiConfig, type AiMode } from "@/lib/ai/config";
import { testAiConnection, type ConnectionTestResult } from "@/lib/ai/client";
import { estimateCostUsd } from "@/lib/ai/usage";
import { invalidateSpendCache } from "@/lib/ai/budget";
import { PROVIDER_IDS, type ProviderId } from "@/lib/ai/providers";

export interface ActionMsg { ok: boolean; message: string }

async function guard() {
  const user = await requireUser();
  if (!can(user.role, "admin:settings")) throw new Error("Bạn không có quyền cấu hình hệ thống.");
  return user;
}
const isProvider = (p: string): p is ProviderId => (PROVIDER_IDS as string[]).includes(p);
const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function saveKeyAction(provider: string, key: string | null): Promise<ActionMsg> {
  try {
    const user = await guard();
    if (!isProvider(provider)) return { ok: false, message: "Nhà cung cấp không hợp lệ." };
    if (key !== null && !key.trim()) return { ok: false, message: "Nhập API key." };
    await updateAiConfig({ keys: { [provider]: key === null ? null : key.trim() }, userId: user.id });
    // Never log the key itself.
    await logAudit({ userId: user.id, action: "AI_KEY_UPDATE", entityType: "AppSetting", entityId: "ai.config", detail: { provider, key: key === null ? "removed" : "updated" } });
    revalidatePath("/admin/ai-config");
    return { ok: true, message: key === null ? "Đã xóa key." : "Đã lưu key (mã hóa AES-256-GCM)." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Lỗi" };
  }
}

export async function testConnectionAction(provider: string, model?: string): Promise<ConnectionTestResult> {
  const user = await guard();
  const p: ProviderId = isProvider(provider) ? provider : "anthropic";
  const res = await testAiConnection(p, user.id, model);
  revalidatePath("/admin/ai-config");
  return res;
}

export async function saveRoutingAction(fd: FormData): Promise<ActionMsg> {
  try {
    const user = await guard();
    const mode = String(fd.get("mode") || "auto") as AiMode;
    const tier = (t: "high" | "economy") => {
      const provider = String(fd.get(`${t}Provider`) || "");
      const model = String(fd.get(`${t}Model`) || "").trim();
      return isProvider(provider) && model ? { provider, model } : undefined;
    };
    const high = tier("high"), economy = tier("economy");
    if (!high || !economy) return { ok: false, message: "Chọn nhà cung cấp và nhập mô hình cho cả 2 mức." };
    const fallback = [fd.get("fb1"), fd.get("fb2"), fd.get("fb3")].map(String).filter(isProvider).filter((p, i, a) => a.indexOf(p) === i);
    await updateAiConfig({ mode: ["auto", "real", "mock"].includes(mode) ? mode : "auto", tiers: { high, economy }, fallback, userId: user.id });
    await logAudit({ userId: user.id, action: "AI_ROUTING_UPDATE", entityType: "AppSetting", entityId: "ai.config", detail: { mode, high, economy, fallback } });
    revalidatePath("/admin/ai-config");
    return { ok: true, message: "Đã lưu phân tầng mô hình và thứ tự dự phòng." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Lỗi" };
  }
}

export async function saveBudgetAction(fd: FormData): Promise<ActionMsg> {
  try {
    const user = await guard();
    const unit = String(fd.get("unit") || "usd");
    const rate = (await import("@/lib/ai/usage")).USD_TO_VND;
    const toUsd = (v: number | null) => (v === null ? null : unit === "vnd" ? Math.round((v / rate) * 100) / 100 : v);
    const warn = num(fd.get("warnPct"));
    const budget = {
      monthlyUsd: toUsd(num(fd.get("monthly"))),
      dailyUsd: toUsd(num(fd.get("daily"))),
      perUserDailyUsd: toUsd(num(fd.get("perUser"))),
      warnPct: warn === null ? 0.8 : Math.min(1, Math.max(0.1, warn / 100)),
    };
    await updateAiConfig({ budget, autoEvidenceCheck: fd.get("autoEvidenceCheck") === "on", userId: user.id });
    invalidateSpendCache();
    await logAudit({ userId: user.id, action: "AI_BUDGET_UPDATE", entityType: "AppSetting", entityId: "ai.config", detail: { ...budget, autoEvidenceCheck: fd.get("autoEvidenceCheck") === "on" } });
    revalidatePath("/admin/ai-config");
    return { ok: true, message: "Đã lưu hạn mức chi phí." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Lỗi" };
  }
}

export async function savePricesAction(rows: Array<{ model: string; input: string; output: string }>): Promise<ActionMsg> {
  try {
    const user = await guard();
    const prices: Record<string, { input: number; output: number } | null> = {};
    for (const r of rows) {
      const model = r.model.trim();
      if (!model) continue;
      const i = num(r.input), o = num(r.output);
      prices[model] = i === null || o === null ? null : { input: i, output: o };
    }
    await updateAiConfig({ prices, userId: user.id });
    await logAudit({ userId: user.id, action: "AI_PRICES_UPDATE", entityType: "AppSetting", entityId: "ai.config", detail: prices });
    revalidatePath("/admin/ai-config");
    return { ok: true, message: "Đã lưu bảng đơn giá." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Lỗi" };
  }
}

/** Recompute the stored cost of every logged call with the current price table (e.g. after fixing a price). */
export async function recalcCostsAction(): Promise<ActionMsg> {
  try {
    const user = await guard();
    const cfg = await getAiConfig();
    const groups = await prisma.aiUsageLog.groupBy({ by: ["model"], where: { usedFallback: false }, _sum: { costUsd: true } });
    let before = 0, after = 0;
    for (const g of groups) {
      before += g._sum.costUsd ?? 0;
      const logs = await prisma.aiUsageLog.findMany({ where: { model: g.model, usedFallback: false }, select: { id: true, inputTokens: true, outputTokens: true } });
      for (const l of logs) {
        const c = estimateCostUsd(g.model, l.inputTokens, l.outputTokens, cfg.prices);
        after += c;
        await prisma.aiUsageLog.update({ where: { id: l.id }, data: { costUsd: c } });
      }
    }
    invalidateSpendCache();
    await logAudit({ userId: user.id, action: "AI_COST_RECALC", entityType: "AiUsageLog", entityId: null, detail: { before, after } });
    revalidatePath("/admin/ai-config");
    return { ok: true, message: `Đã tính lại chi phí: $${before.toFixed(2)} → $${after.toFixed(2)}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Lỗi" };
  }
}
