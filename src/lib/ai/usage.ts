// AI usage accounting: token pricing, cost estimation and per-call logging.
// These numbers drive the admin "Sử dụng AI" (token & cost) dashboard.

import { prisma } from "../db";
import { PROVIDERS, type ProviderId } from "./providers";

export interface ModelPricing {
  input: number; // USD per 1,000,000 input tokens
  output: number; // USD per 1,000,000 output tokens
}

// List prices (USD / 1M tokens) for Claude models (Anthropic first-party API, Nov 2026). Matched in order, so the
// most specific id comes first. OpenAI / Gemini prices change often: admins enter them on the AI config page
// (overrides win over this table). Unknown models are priced conservatively.
const PRICING: Array<{ match: (m: string) => boolean; price: ModelPricing }> = [
  { match: (m) => m.includes("fable-5-2") || m.includes("mythos-5-2"), price: { input: 8, output: 40 } },
  { match: (m) => m.includes("fable") || m.includes("mythos"), price: { input: 10, output: 50 } },
  { match: (m) => m.includes("opus-5-5"), price: { input: 4, output: 20 } },
  { match: (m) => /opus-(5|4-[678])/.test(m), price: { input: 5, output: 25 } },
  { match: (m) => m.includes("opus"), price: { input: 15, output: 75 } },
  { match: (m) => /sonnet-5/.test(m), price: { input: 2, output: 10 } },
  { match: (m) => m.includes("sonnet"), price: { input: 3, output: 15 } },
  { match: (m) => m.includes("haiku-5-5"), price: { input: 0.1, output: 0.5 } },
  { match: (m) => m.includes("haiku-4-5"), price: { input: 1, output: 5 } },
  { match: (m) => m.includes("haiku"), price: { input: 0.8, output: 4 } },
];

/** Price used when a model is unknown and no override exists (deliberately high so budgets err on the safe side). */
export const DEFAULT_PRICING: ModelPricing = { input: 5, output: 25 };

/** Built-in price for a model, or null when the model is not in the table. */
export function builtinPricing(model: string): ModelPricing | null {
  return PRICING.find((p) => p.match(model))?.price ?? null;
}

export function pricingFor(model: string, overrides?: Record<string, ModelPricing>): ModelPricing {
  return overrides?.[model] ?? builtinPricing(model) ?? DEFAULT_PRICING;
}

/** Cost of a call in USD. Self-hosted providers (LocalAI) cost nothing per token unless the admin sets a price. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number, overrides?: Record<string, ModelPricing>, provider?: string | null): number {
  if (provider && PROVIDERS[provider as ProviderId]?.local && !overrides?.[model]) return 0;
  const p = pricingFor(model, overrides);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** USD → VND rate for display only (configurable via env). */
export const USD_TO_VND = Number(process.env.AI_USD_TO_VND || 25500);

export function formatUsd(v: number): string {
  return `$${v.toFixed(4)}`;
}

export function formatVnd(usd: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(usd * USD_TO_VND))}đ`;
}

export function formatTokens(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

// Human-readable Vietnamese labels for each AI feature key.
export const FEATURE_LABELS: Record<string, string> = {
  evidence_summary: "Tóm tắt minh chứng",
  criterion_suggestion: "Gợi ý tiêu chí",
  sar_draft: "Soạn nháp SAR",
  sar_review: "Rà soát SAR",
  sar_review_adv: "Rà soát SAR nâng cao",
  syllabus_review: "Rà soát đề cương",
  survey_analysis: "Phân tích khảo sát",
  improvement_suggestion: "Đề xuất cải tiến (PDCA)",
  rag_chat: "Trợ lý AI (RAG)",
  matrix_check: "Rà soát ma trận PLO",
  gap_analysis: "Phân tích khoảng trống",
  curriculum_check: "Kiểm tra logic CTĐT",
  external_response: "Soạn giải trình đánh giá ngoài",
  connection_test: "Kiểm tra kết nối",
  ocr: "OCR bản scan / ảnh",
  interview_questions: "Gợi ý câu hỏi phỏng vấn",
  leadership_brief: "Nhận định cho lãnh đạo",
  evidence_check: "AI kiểm tra minh chứng",
  fact_suggestion: "Đề xuất số liệu chính",
  fact_check: "Đối chiếu số liệu chính",
  syllabus_import: "Nhập đề cương từ Word",
  bulk_classify: "AI phân loại hàng loạt",
  other: "Khác",
};

export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

export interface AiUsageEntry {
  feature: string;
  model: string;
  provider?: string | null;
  tier?: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  usedFallback: boolean;
  success: boolean;
  userId?: string | null;
}

/** Record a single AI call. Never throws — usage logging must not break a feature. */
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        feature: entry.feature,
        model: entry.model,
        provider: entry.provider ?? null,
        tier: entry.tier ?? null,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        totalTokens: entry.inputTokens + entry.outputTokens,
        costUsd: entry.costUsd,
        usedFallback: entry.usedFallback,
        success: entry.success,
        userId: entry.userId ?? null,
      },
    });
  } catch (err) {
    console.error("[ai-usage] failed to log usage:", err);
  }
}
