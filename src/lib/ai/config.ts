// Runtime AI configuration, stored in the database so an admin can set the
// Claude API key / model / mode from the UI (no redeploy). A DB key overrides
// the ANTHROPIC_API_KEY environment variable; the env value is the fallback.

import { prisma } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import type { Prisma } from "@/generated/prisma/client";

export type AiMode = "auto" | "real" | "mock";

export const AI_CONFIG_KEY = "ai.config";
const DEFAULT_MODEL = "claude-opus-4-8";

export interface StoredAiConfig {
  model?: string;
  mode?: AiMode;
  apiKeyEnc?: string;
  apiKeyLast4?: string;
}

export interface AiConfig {
  model: string;
  mode: AiMode;
  apiKey: string | null; // resolved key actually used for calls (DB > env)
  apiKeyLast4: string | null;
  keySource: "db" | "env" | "none";
}

export const AI_MODE_LABELS: Record<AiMode, string> = {
  auto: "Tự động (có key → Claude)",
  real: "Bắt buộc dùng Claude",
  mock: "Mô phỏng (luôn dùng dự phòng)",
};

async function readStored(): Promise<StoredAiConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: AI_CONFIG_KEY } });
  return (row?.value as StoredAiConfig | undefined) ?? {};
}

export async function getAiConfig(): Promise<AiConfig> {
  const stored = await readStored();
  const dbKey = stored.apiKeyEnc ? decryptSecret(stored.apiKeyEnc) : null;
  const envKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  const apiKey = dbKey || envKey;

  return {
    model: stored.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    mode: stored.mode || "auto",
    apiKey,
    apiKeyLast4: dbKey ? stored.apiKeyLast4 ?? dbKey.slice(-4) : envKey ? envKey.slice(-4) : null,
    keySource: dbKey ? "db" : envKey ? "env" : "none",
  };
}

/** Whether real Claude calls will be attempted under the current config. */
export async function aiLiveEnabled(): Promise<boolean> {
  const cfg = await getAiConfig();
  return cfg.mode !== "mock" && Boolean(cfg.apiKey);
}

export interface SaveAiConfigInput {
  model?: string;
  mode?: AiMode;
  apiKey?: string | null; // a new key to store (ignored if blank)
  clearKey?: boolean; // remove the stored DB key
  userId?: string | null;
}

export async function saveAiConfig(input: SaveAiConfigInput): Promise<void> {
  const current = await readStored();
  const next: StoredAiConfig = { ...current };

  if (input.model && input.model.trim()) next.model = input.model.trim();
  if (input.mode) next.mode = input.mode;

  if (input.clearKey) {
    delete next.apiKeyEnc;
    delete next.apiKeyLast4;
  } else if (input.apiKey && input.apiKey.trim()) {
    const key = input.apiKey.trim();
    next.apiKeyEnc = encryptSecret(key);
    next.apiKeyLast4 = key.slice(-4);
  }

  const value = next as unknown as Prisma.InputJsonValue;
  await prisma.appSetting.upsert({
    where: { key: AI_CONFIG_KEY },
    update: { value, updatedById: input.userId ?? null },
    create: { key: AI_CONFIG_KEY, value, updatedById: input.userId ?? null },
  });
}
