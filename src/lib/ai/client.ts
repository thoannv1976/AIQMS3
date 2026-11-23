// Single entry point for AI text generation across providers (Claude, OpenAI, Gemini, LocalAI).
// Principle from the spec: AI only *suggests*; humans review and approve. Every call:
//   1. picks the tier for the feature ("high" quality vs "economy") and the provider chain (primary + fallbacks),
//   2. checks the spending limits with a cost estimate before calling,
//   3. logs provider/model/tokens/cost, and falls back to a deterministic heuristic if nothing can answer.

import { getAiConfig, type AiConfig } from "./config";
import { estimateCostUsd, logAiUsage } from "./usage";
import { checkBudget, maybeWarn } from "./budget";
import { callProvider, listModels, PROVIDERS, PROVIDER_IDS, ProviderError, type ProviderId, type Tier } from "./providers";
import { prisma } from "../db";

export const AI_LAST_ERROR_KEY = "ai.lastError";

/** Keep the latest AI failure (e.g. "credit balance is too low") so admins see why AI fell back. */
async function recordAiError(err: unknown, provider?: string): Promise<void> {
  const raw = err instanceof Error ? err.message : String(err);
  const m = /"message"\s*:\s*"([^"]+)"/.exec(raw);
  const message = `${provider ? `[${PROVIDERS[provider as ProviderId]?.label ?? provider}] ` : ""}${(m?.[1] ?? raw).slice(0, 300)}`;
  const value = { at: new Date().toISOString(), message, provider: provider ?? null };
  await prisma.appSetting.upsert({ where: { key: AI_LAST_ERROR_KEY }, update: { value }, create: { key: AI_LAST_ERROR_KEY, value } }).catch(() => {});
}

export interface AiResult {
  text: string;
  usedFallback: boolean;
  model: string;
  provider?: ProviderId;
  inputTokens?: number;
  outputTokens?: number;
  /** Set when the call was refused by the spending limits. */
  blockedReason?: string;
}

/** Optional call metadata (which user triggered the call) for usage attribution and per-user limits. */
export interface AiMeta {
  userId?: string | null;
}

/** Features that need the best model; everything else runs on the economy tier. */
const HIGH_FEATURES = new Set([
  "sar_draft", "sar_review", "sar_review_adv", "interview_questions", "leadership_brief", "external_response",
  "gap_analysis", "curriculum_check", "matrix_check", "fact_check", "syllabus_review", "survey_analysis", "rag_chat",
]);
export function tierOf(feature: string): Tier {
  return HIGH_FEATURES.has(feature) ? "high" : "economy";
}

/** Rough token estimate for budgeting (Vietnamese text ≈ 2.5 characters per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5);
}

/** Primary provider/model for the tier, then the fallback providers that have a key. */
export function candidatesFor(cfg: AiConfig, tier: Tier): Array<{ provider: ProviderId; model: string }> {
  const out: Array<{ provider: ProviderId; model: string }> = [];
  const push = (provider: ProviderId, model: string) => {
    if (model && cfg.keys[provider].ready && !out.some((c) => c.provider === provider)) out.push({ provider, model });
  };
  push(cfg.tiers[tier].provider, cfg.tiers[tier].model);
  for (const p of cfg.fallback) {
    const other: Tier = tier === "high" ? "economy" : "high";
    const model = cfg.tiers[tier].provider === p ? cfg.tiers[tier].model : cfg.tiers[other].provider === p ? cfg.tiers[other].model : PROVIDERS[p].defaults[tier];
    push(p, model);
  }
  return out;
}

/** True when at least one provider is usable under the current configuration. */
export async function aiConfigured(): Promise<boolean> {
  const cfg = await getAiConfig();
  return cfg.mode !== "mock" && PROVIDER_IDS.some((p) => cfg.keys[p].ready);
}

/** Call arguments that depend on the provider (key, LocalAI address). */
function access(cfg: AiConfig, p: ProviderId): { apiKey: string; baseUrl?: string } {
  return { apiKey: cfg.keys[p].key ?? "", baseUrl: PROVIDERS[p].local ? cfg.localai.baseUrl ?? undefined : undefined };
}

export async function aiModel(): Promise<string> {
  return (await getAiConfig()).tiers.high.model;
}

/**
 * Run a single completion. When no provider is usable, the mode is "mock", the spending limit is reached, or
 * every provider fails, `fallback()` keeps the feature working (and the result says so).
 */
export async function aiComplete(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  fallback: () => string;
  feature?: string;
  userId?: string | null;
  tier?: Tier;
  attachment?: { mediaType: string; base64: string; fileName: string };
}): Promise<AiResult> {
  const cfg = await getAiConfig();
  const feature = opts.feature ?? "other";
  const tier = opts.tier ?? tierOf(feature);
  const maxTokens = opts.maxTokens ?? 1500;
  const fallbackResult = async (blockedReason?: string): Promise<AiResult> => {
    await logAiUsage({ feature, model: "fallback-heuristic", tier, inputTokens: 0, outputTokens: 0, costUsd: 0, usedFallback: true, success: !blockedReason, userId: opts.userId });
    return { text: opts.fallback(), usedFallback: true, model: "fallback-heuristic", blockedReason };
  };

  const all = cfg.mode === "mock" ? [] : candidatesFor(cfg, tier);
  // PDF/image input (OCR) only goes to providers that can read files; say so instead of failing.
  const candidates = opts.attachment ? all.filter((c) => PROVIDERS[c.provider].vision) : all;
  if (!candidates.length) {
    if (all.length) {
      const reason = `${PROVIDERS[all[0].provider].label} chưa hỗ trợ đọc tệp PDF/ảnh (OCR) – thêm key Claude, OpenAI hoặc Gemini để dùng tính năng này.`;
      await recordAiError(new Error(reason));
      return fallbackResult(reason);
    }
    return fallbackResult();
  }

  // Spending limits: estimate with the primary model (input from text length, output at the cap).
  const estIn = estimateTokens(`${opts.system ?? ""}${opts.prompt}`) + (opts.attachment ? Math.ceil(opts.attachment.base64.length / 3) : 0);
  const est = estimateCostUsd(candidates[0].model, estIn, maxTokens, cfg.prices, candidates[0].provider);
  const decision = await checkBudget(cfg.budget, est, opts.userId);
  if (!decision.ok) {
    await recordAiError(new Error(decision.reason));
    return fallbackResult(decision.reason);
  }

  for (const c of candidates) {
    try {
      const r = await callProvider({ provider: c.provider, model: c.model, ...access(cfg, c.provider), system: opts.system, prompt: opts.prompt, maxTokens, tier, attachment: opts.attachment });
      await logAiUsage({
        feature, model: c.model, provider: c.provider, tier, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
        costUsd: estimateCostUsd(c.model, r.inputTokens, r.outputTokens, cfg.prices, c.provider), usedFallback: false, success: true, userId: opts.userId,
      });
      await maybeWarn(cfg.budget).catch(() => {});
      if (!r.text) continue;
      return { text: r.text, usedFallback: false, model: c.model, provider: c.provider, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
    } catch (err) {
      console.error(`[ai] ${c.provider}/${c.model} failed:`, err instanceof Error ? err.message : err);
      await recordAiError(err, c.provider);
      await logAiUsage({ feature, model: c.model, provider: c.provider, tier, inputTokens: 0, outputTokens: 0, costUsd: 0, usedFallback: true, success: false, userId: opts.userId });
    }
  }
  return { ...(await fallbackResult()), text: opts.fallback() };
}

export interface ConnectionTestResult {
  ok: boolean;
  provider: ProviderId;
  model: string;
  keySource: "db" | "env" | "none";
  message: string;
  models?: string[];
  inputTokens?: number;
  outputTokens?: number;
}

/** Make a tiny real call to verify a provider's key and model, and list the models the key can use. */
export async function testAiConnection(provider: ProviderId = "anthropic", userId?: string | null, model?: string): Promise<ConnectionTestResult> {
  const cfg = await getAiConfig();
  const k = cfg.keys[provider];
  const useModel = model || (cfg.tiers.high.provider === provider ? cfg.tiers.high.model : cfg.tiers.economy.provider === provider ? cfg.tiers.economy.model : PROVIDERS[provider].defaults.economy);
  const local = Boolean(PROVIDERS[provider].local);
  if (!k.ready) return { ok: false, provider, model: useModel, keySource: k.source, message: local ? "Chưa cấu hình địa chỉ LocalAI." : "Chưa có API key cho nhà cung cấp này." };
  const acc = access(cfg, provider);
  let models: string[] | undefined;
  let listError = "";
  try {
    models = await listModels(provider, acc.apiKey, acc.baseUrl);
  } catch (e) {
    models = undefined;
    listError = e instanceof Error ? e.message : String(e);
  }
  if (local && !models) return { ok: false, provider, model: useModel, keySource: k.source, message: `Lỗi kết nối: ${listError || "không đọc được danh sách mô hình."}` };
  if (!useModel) {
    return { ok: Boolean(models), provider, model: "", keySource: k.source, models, message: models ? `Key hợp lệ: ${models.length} mô hình khả dụng. Chọn mô hình rồi kiểm tra lại.` : "Không liệt kê được mô hình – kiểm tra lại key." };
  }
  if (local && models && !models.includes(useModel)) {
    return { ok: false, provider, model: useModel, keySource: k.source, models, message: `LocalAI không có mô hình ${useModel}. Chọn một trong ${models.length} mô hình khả dụng.` };
  }
  try {
    // Local models may need to load into GPU memory first (~90 s) and think before answering: allow more tokens.
    const r = await callProvider({ provider, model: useModel, ...acc, prompt: "ping – trả lời 'ok'.", maxTokens: local ? 64 : 16, tier: "economy" });
    await logAiUsage({ feature: "connection_test", model: useModel, provider, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: estimateCostUsd(useModel, r.inputTokens, r.outputTokens, cfg.prices, provider), usedFallback: false, success: true, userId });
    return { ok: true, provider, model: useModel, keySource: k.source, models, message: `Kết nối ${PROVIDERS[provider].label} thành công với mô hình ${useModel}.`, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
  } catch (err) {
    await logAiUsage({ feature: "connection_test", model: useModel, provider, inputTokens: 0, outputTokens: 0, costUsd: 0, usedFallback: true, success: false, userId });
    const message = err instanceof ProviderError || err instanceof Error ? err.message : String(err);
    return { ok: false, provider, model: useModel, keySource: k.source, models, message: `Lỗi kết nối: ${message}` };
  }
}
