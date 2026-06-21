"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { saveAiConfig, type AiMode } from "@/lib/ai/config";
import { testAiConnection, type ConnectionTestResult } from "@/lib/ai/client";

export interface ConfigFormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const MODES: AiMode[] = ["auto", "real", "mock"];

export async function saveAiConfigAction(_prev: ConfigFormState, formData: FormData): Promise<ConfigFormState> {
  const actor = await requireUser();
  if (!can(actor.role, "admin:settings")) return { error: "Bạn không có quyền cấu hình hệ thống." };

  const model = String(formData.get("model") || "").trim();
  const modeRaw = String(formData.get("mode") || "auto") as AiMode;
  const mode = MODES.includes(modeRaw) ? modeRaw : "auto";
  const apiKey = String(formData.get("apiKey") || "");
  const clearKey = formData.get("clearKey") === "on";

  await saveAiConfig({ model, mode, apiKey: clearKey ? null : apiKey, clearKey, userId: actor.id });

  // Never log the key itself — only whether it changed.
  await logAudit({
    userId: actor.id,
    action: "AI_CONFIG_UPDATE",
    entityType: "AppSetting",
    entityId: "ai.config",
    detail: { model, mode, key: clearKey ? "cleared" : apiKey.trim() ? "updated" : "unchanged" },
  });

  revalidatePath("/admin/ai-config");
  return { ok: true, message: "Đã lưu cấu hình AI." };
}

export async function testConnectionAction(): Promise<ConnectionTestResult> {
  const actor = await requireUser();
  if (!can(actor.role, "admin:settings")) {
    return { ok: false, model: "", keySource: "none", message: "Bạn không có quyền." };
  }
  const res = await testAiConnection(actor.id);
  revalidatePath("/admin/ai-config");
  return res;
}
