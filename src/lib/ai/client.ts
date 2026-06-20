// Thin wrapper around the Anthropic Claude API with a safe deterministic fallback.
// Principle from the spec: AI only *suggests*; humans review and approve. Every call
// reports whether the real model or the local fallback was used (human-in-the-loop)
// and is recorded in the AI usage ledger (tokens + cost) for the admin dashboard.

import { getAiConfig } from "./config";
import { estimateCostUsd, logAiUsage } from "./usage";

export interface AiResult {
  text: string;
  usedFallback: boolean;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Optional call metadata (which user triggered the call) for usage attribution. */
export interface AiMeta {
  userId?: string | null;
}

/** True when real Claude calls are enabled under the current DB/env configuration. */
export async function aiConfigured(): Promise<boolean> {
  const cfg = await getAiConfig();
  return cfg.mode !== "mock" && Boolean(cfg.apiKey);
}

export async function aiModel(): Promise<string> {
  return (await getAiConfig()).model;
}

function extractText(content: unknown): string {
  return (content as Array<{ type: string; text?: string }>)
    .map((b) => (b.type === "text" ? b.text ?? "" : ""))
    .join("\n")
    .trim();
}

/**
 * Run a single completion. The API key, model and mode come from the database
 * (admin-configurable), falling back to env vars. When no key is available, or
 * mode is "mock", or the call fails, `fallback()` keeps the feature working.
 */
export async function aiComplete(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  fallback: () => string;
  feature?: string;
  userId?: string | null;
}): Promise<AiResult> {
  const cfg = await getAiConfig();
  const feature = opts.feature ?? "other";
  const useReal = cfg.mode !== "mock" && Boolean(cfg.apiKey);

  if (!useReal) {
    const text = opts.fallback();
    await logAiUsage({
      feature,
      model: "fallback-heuristic",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      usedFallback: true,
      success: true,
      userId: opts.userId,
    });
    return { text, usedFallback: true, model: "fallback-heuristic" };
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: cfg.apiKey! });
    const msg = await client.messages.create({
      model: cfg.model,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    });
    const text = extractText(msg.content);
    const inputTokens = msg.usage?.input_tokens ?? 0;
    const outputTokens = msg.usage?.output_tokens ?? 0;
    await logAiUsage({
      feature,
      model: cfg.model,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(cfg.model, inputTokens, outputTokens),
      usedFallback: false,
      success: true,
      userId: opts.userId,
    });
    return { text: text || opts.fallback(), usedFallback: false, model: cfg.model, inputTokens, outputTokens };
  } catch (err) {
    console.error("[ai] Claude call failed, using fallback:", err);
    await logAiUsage({
      feature,
      model: cfg.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      usedFallback: true,
      success: false,
      userId: opts.userId,
    });
    return { text: opts.fallback(), usedFallback: true, model: "fallback-heuristic" };
  }
}

export interface ConnectionTestResult {
  ok: boolean;
  model: string;
  keySource: "db" | "env" | "none";
  message: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Make a tiny real call to verify the configured key/model works. */
export async function testAiConnection(userId?: string | null): Promise<ConnectionTestResult> {
  const cfg = await getAiConfig();
  if (!cfg.apiKey) {
    return {
      ok: false,
      model: cfg.model,
      keySource: cfg.keySource,
      message: "Chưa có API key (cả trong CSDL lẫn biến môi trường). Hãy nạp key trước.",
    };
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const msg = await client.messages.create({
      model: cfg.model,
      max_tokens: 16,
      messages: [{ role: "user", content: "ping" }],
    });
    const inputTokens = msg.usage?.input_tokens ?? 0;
    const outputTokens = msg.usage?.output_tokens ?? 0;
    await logAiUsage({
      feature: "connection_test",
      model: cfg.model,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(cfg.model, inputTokens, outputTokens),
      usedFallback: false,
      success: true,
      userId,
    });
    return {
      ok: true,
      model: cfg.model,
      keySource: cfg.keySource,
      message: `Kết nối Claude thành công với model ${cfg.model}.`,
      inputTokens,
      outputTokens,
    };
  } catch (err) {
    await logAiUsage({
      feature: "connection_test",
      model: cfg.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      usedFallback: true,
      success: false,
      userId,
    });
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, model: cfg.model, keySource: cfg.keySource, message: `Lỗi kết nối: ${message}` };
  }
}
