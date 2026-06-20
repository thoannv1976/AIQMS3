// AI usage accounting: token pricing, cost estimation and per-call logging.
// These numbers drive the admin "Sử dụng AI" (token & cost) dashboard.

import { prisma } from "../db";

export interface ModelPricing {
  input: number; // USD per 1,000,000 input tokens
  output: number; // USD per 1,000,000 output tokens
}

// List prices (USD / 1M tokens). Matched by substring so new dated model ids keep working.
const PRICING: Array<{ match: (m: string) => boolean; price: ModelPricing }> = [
  { match: (m) => m.includes("opus"), price: { input: 15, output: 75 } },
  { match: (m) => m.includes("sonnet"), price: { input: 3, output: 15 } },
  { match: (m) => m.includes("haiku"), price: { input: 0.8, output: 4 } },
];

const DEFAULT_PRICING: ModelPricing = { input: 15, output: 75 };

export function pricingFor(model: string): ModelPricing {
  return PRICING.find((p) => p.match(model))?.price ?? DEFAULT_PRICING;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = pricingFor(model);
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
  connection_test: "Kiểm tra kết nối",
  other: "Khác",
};

export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

export interface AiUsageEntry {
  feature: string;
  model: string;
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
