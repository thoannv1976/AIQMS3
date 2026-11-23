"use server";

import { requireUser } from "@/lib/auth";
import { getAiConfig } from "@/lib/ai/config";
import { candidatesFor } from "@/lib/ai/client";
import { currentSpend } from "@/lib/ai/budget";
import { estimateCostUsd } from "@/lib/ai/usage";
import { PROVIDERS } from "@/lib/ai/providers";

/** Typical tokens per item (measured on SBI-TDG): input = evidence passages + prompt, output incl. thinking. */
const PROFILE = {
  sar_draft: { tier: "high" as const, input: 9000, output: 4000 },
  evidence_check: { tier: "economy" as const, input: 3000, output: 400 },
};

export interface CostEstimate {
  total: number;
  perItem: number;
  model: string;
  provider: string;
  remainingMonth: number | null;
  remainingDay: number | null;
  exceeds: boolean;
  aiOff: boolean;
}

/** Estimated cost of a bulk AI run, shown to the user before it starts. */
export async function estimateAiCostAction(kind: keyof typeof PROFILE, count: number): Promise<CostEstimate> {
  await requireUser();
  const cfg = await getAiConfig();
  const prof = PROFILE[kind];
  const c = cfg.mode === "mock" ? undefined : candidatesFor(cfg, prof.tier)[0];
  const spend = await currentSpend();
  const perItem = c ? estimateCostUsd(c.model, prof.input, prof.output, cfg.prices, c.provider) : 0;
  const total = perItem * Math.max(0, count);
  const remainingMonth = cfg.budget.monthlyUsd == null ? null : Math.max(0, cfg.budget.monthlyUsd - spend.month);
  const remainingDay = cfg.budget.dailyUsd == null ? null : Math.max(0, cfg.budget.dailyUsd - spend.day);
  const room = Math.min(remainingMonth ?? Infinity, remainingDay ?? Infinity);
  return { total, perItem, model: c?.model ?? "—", provider: c ? PROVIDERS[c.provider].label : "—", remainingMonth, remainingDay, exceeds: total > room, aiOff: !c };
}
