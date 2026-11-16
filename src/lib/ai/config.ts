// Runtime AI configuration stored in the database (no redeploy needed):
//   - API keys for Claude / OpenAI / Gemini (AES-256-GCM encrypted; env vars are the fallback)
//   - which provider+model serves the "high quality" and the "economy" tier, and the fallback order
//   - price overrides, spending limits, and whether new evidence is AI-checked automatically.
// Backward compatible with the original single-key Claude config ({ apiKeyEnc, model, mode }).

import { prisma } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import type { Prisma } from "@/generated/prisma/client";
import { PROVIDERS, PROVIDER_IDS, type ProviderId, type Tier } from "./providers";

export type AiMode = "auto" | "real" | "mock";
export const AI_CONFIG_KEY = "ai.config";

export interface TierChoice { provider: ProviderId; model: string }
export interface BudgetConfig {
  monthlyUsd: number | null;
  dailyUsd: number | null;
  perUserDailyUsd: number | null;
  warnPct: number; // 0..1
}
export interface PriceOverride { input: number; output: number }

export interface StoredAiConfig {
  // legacy (single Claude key)
  model?: string;
  apiKeyEnc?: string;
  apiKeyLast4?: string;
  // v2
  mode?: AiMode;
  keys?: Partial<Record<ProviderId, { enc: string; last4: string }>>;
  tiers?: Partial<Record<Tier, TierChoice>>;
  fallback?: ProviderId[];
  prices?: Record<string, PriceOverride>;
  budget?: Partial<BudgetConfig>;
  autoEvidenceCheck?: boolean;
}

export interface ProviderKeyInfo { key: string | null; last4: string | null; source: "db" | "env" | "none" }

export interface AiConfig {
  mode: AiMode;
  keys: Record<ProviderId, ProviderKeyInfo>;
  tiers: Record<Tier, TierChoice>;
  fallback: ProviderId[];
  prices: Record<string, PriceOverride>;
  budget: BudgetConfig;
  autoEvidenceCheck: boolean;
  // Legacy view (the "high" tier), kept for older call sites.
  model: string;
  apiKey: string | null;
  apiKeyLast4: string | null;
  keySource: "db" | "env" | "none";
}

export const AI_MODE_LABELS: Record<AiMode, string> = {
  auto: "Tự động (có key → gọi AI)",
  real: "Bắt buộc gọi AI",
  mock: "Mô phỏng (luôn dùng dự phòng)",
};

export const DEFAULT_BUDGET: BudgetConfig = { monthlyUsd: 50, dailyUsd: 10, perUserDailyUsd: 3, warnPct: 0.8 };

async function readStored(): Promise<StoredAiConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: AI_CONFIG_KEY } });
  return (row?.value as StoredAiConfig | undefined) ?? {};
}

function resolveKey(stored: StoredAiConfig, p: ProviderId): ProviderKeyInfo {
  const db = stored.keys?.[p] ?? (p === "anthropic" && stored.apiKeyEnc ? { enc: stored.apiKeyEnc, last4: stored.apiKeyLast4 ?? "" } : undefined);
  const dbKey = db ? decryptSecret(db.enc) : null;
  if (dbKey) return { key: dbKey, last4: db?.last4 || dbKey.slice(-4), source: "db" };
  const env = process.env[PROVIDERS[p].envVar]?.trim() || (p === "gemini" ? process.env.GOOGLE_API_KEY?.trim() : undefined) || null;
  return env ? { key: env, last4: env.slice(-4), source: "env" } : { key: null, last4: null, source: "none" };
}

export async function getAiConfig(): Promise<AiConfig> {
  const s = await readStored();
  const keys = Object.fromEntries(PROVIDER_IDS.map((p) => [p, resolveKey(s, p)])) as Record<ProviderId, ProviderKeyInfo>;
  const pick = (tier: Tier): TierChoice => {
    const t = s.tiers?.[tier];
    if (t?.provider && t.model) return t;
    // First provider that has a key and a default model for the tier (Claude first).
    for (const p of PROVIDER_IDS) if (keys[p].key && PROVIDERS[p].defaults[tier]) return { provider: p, model: PROVIDERS[p].defaults[tier] };
    return { provider: "anthropic", model: PROVIDERS.anthropic.defaults[tier] };
  };
  const tiers = { high: pick("high"), economy: pick("economy") };
  const fallback = (s.fallback?.length ? s.fallback : PROVIDER_IDS).filter((p, i, a) => PROVIDER_IDS.includes(p) && a.indexOf(p) === i);
  const budget: BudgetConfig = { ...DEFAULT_BUDGET, ...(s.budget ?? {}) };
  const hi = keys[tiers.high.provider];
  return {
    mode: s.mode || "auto",
    keys,
    tiers,
    fallback,
    prices: s.prices ?? {},
    budget,
    autoEvidenceCheck: s.autoEvidenceCheck ?? true,
    model: tiers.high.model,
    apiKey: hi.key,
    apiKeyLast4: hi.last4,
    keySource: hi.source,
  };
}

/** Whether at least one provider can be called. */
export async function aiLiveEnabled(): Promise<boolean> {
  const cfg = await getAiConfig();
  return cfg.mode !== "mock" && PROVIDER_IDS.some((p) => cfg.keys[p].key);
}

async function writeStored(next: StoredAiConfig, userId?: string | null) {
  const value = next as unknown as Prisma.InputJsonValue;
  await prisma.appSetting.upsert({
    where: { key: AI_CONFIG_KEY },
    update: { value, updatedById: userId ?? null },
    create: { key: AI_CONFIG_KEY, value, updatedById: userId ?? null },
  });
}

/** Partial update of the stored configuration. Keys: a non-empty string sets it, null removes it. */
export async function updateAiConfig(patch: {
  mode?: AiMode;
  keys?: Partial<Record<ProviderId, string | null>>;
  tiers?: Partial<Record<Tier, TierChoice>>;
  fallback?: ProviderId[];
  prices?: Record<string, PriceOverride | null>;
  budget?: Partial<BudgetConfig>;
  autoEvidenceCheck?: boolean;
  userId?: string | null;
}): Promise<void> {
  const cur = await readStored();
  const next: StoredAiConfig = { ...cur, keys: { ...(cur.keys ?? {}) } };
  // Migrate the legacy Claude key into keys.anthropic on first v2 write.
  if (cur.apiKeyEnc && !next.keys!.anthropic) next.keys!.anthropic = { enc: cur.apiKeyEnc, last4: cur.apiKeyLast4 ?? "" };
  delete next.apiKeyEnc;
  delete next.apiKeyLast4;
  if (patch.mode) next.mode = patch.mode;
  for (const [p, v] of Object.entries(patch.keys ?? {}) as Array<[ProviderId, string | null | undefined]>) {
    if (v === null) delete next.keys![p];
    else if (v && v.trim()) next.keys![p] = { enc: encryptSecret(v.trim()), last4: v.trim().slice(-4) };
  }
  if (patch.tiers) next.tiers = { ...(cur.tiers ?? {}), ...patch.tiers };
  if (patch.fallback) next.fallback = patch.fallback;
  if (patch.prices) {
    const prices = { ...(cur.prices ?? {}) };
    for (const [m, v] of Object.entries(patch.prices)) {
      if (v === null) delete prices[m];
      else prices[m] = v;
    }
    next.prices = prices;
  }
  if (patch.budget) next.budget = { ...(cur.budget ?? {}), ...patch.budget };
  if (typeof patch.autoEvidenceCheck === "boolean") next.autoEvidenceCheck = patch.autoEvidenceCheck;
  await writeStored(next, patch.userId);
}

// ---- Legacy API (old single-key form) ----
export interface SaveAiConfigInput {
  model?: string;
  mode?: AiMode;
  apiKey?: string | null;
  clearKey?: boolean;
  userId?: string | null;
}
export async function saveAiConfig(input: SaveAiConfigInput): Promise<void> {
  await updateAiConfig({
    mode: input.mode,
    keys: { anthropic: input.clearKey ? null : input.apiKey ?? undefined },
    tiers: input.model?.trim() ? { high: { provider: "anthropic", model: input.model.trim() } } : undefined,
    userId: input.userId,
  });
}
