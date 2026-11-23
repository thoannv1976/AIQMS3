// Provider adapters: one call shape for Claude (official Anthropic SDK), OpenAI and Google Gemini (REST),
// and LocalAI (self-hosted, OpenAI-compatible API on the school's own machine).
// Each adapter returns text + token usage so the caller can price and log the call.

export type ProviderId = "anthropic" | "openai" | "gemini" | "localai";
export const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "gemini", "localai"];

export interface ProviderInfo {
  label: string;
  keyHint: string;
  envVar: string;
  defaults: { high: string; economy: string };
  suggested: string[];
  consoleUrl: string;
  /** Self-hosted: no API key required (usable once a base URL is set), no token cost. */
  local?: boolean;
  /** Can read PDF / image attachments (OCR, vision). */
  vision: boolean;
}

/** Default LocalAI address as seen from the app container (LocalAI running on the same PC). */
export const LOCALAI_DEFAULT_BASE_URL = "http://host.docker.internal:8080/v1";
const LOCALAI_TIMEOUT_MS = Number(process.env.LOCALAI_TIMEOUT_MS || 300_000);

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    label: "Claude (Anthropic)",
    keyHint: "sk-ant-…",
    envVar: "ANTHROPIC_API_KEY",
    defaults: { high: "claude-sonnet-5-5", economy: "claude-haiku-5-5" },
    suggested: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
    consoleUrl: "https://console.anthropic.com/settings/billing",
    vision: true,
  },
  openai: {
    label: "OpenAI (GPT)",
    keyHint: "sk-…",
    envVar: "OPENAI_API_KEY",
    defaults: { high: "", economy: "" },
    suggested: [],
    consoleUrl: "https://platform.openai.com/settings/organization/billing",
    vision: true,
  },
  gemini: {
    label: "Google Gemini",
    keyHint: "AIza…",
    envVar: "GEMINI_API_KEY",
    defaults: { high: "", economy: "" },
    suggested: [],
    consoleUrl: "https://aistudio.google.com/apikey",
    vision: true,
  },
  localai: {
    label: "LocalAI (máy chủ nội bộ)",
    keyHint: "không bắt buộc",
    envVar: "LOCALAI_API_KEY",
    defaults: { high: "ornith-1.5-9b-q4", economy: "ornith-1.5-9b-q4" },
    suggested: ["ornith-1.5-9b-q4", "granite-4.2-8b-q4", "qwen3.8-4b-q4"],
    consoleUrl: "http://localhost:8080/",
    local: true,
    vision: false,
  },
};

/** Embedding / reranker / speech / image models a LocalAI server lists that cannot answer chat prompts. */
const NON_CHAT_MODEL = /embed|rerank|whisper|wav2vec|piper|vits|tts|stable-?diffusion|sdxl|flux|bark|clip|asr|\.tar|\.bz2/i;

export function normalizeBaseUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, "");
  return /\/v1$/.test(u) ? u : `${u}/v1`;
}

export type Tier = "high" | "economy";

export interface ProviderCall {
  provider: ProviderId;
  model: string;
  apiKey: string;
  system?: string;
  prompt: string;
  maxTokens: number;
  tier: Tier;
  /** Server address for self-hosted providers (LocalAI), e.g. http://host.docker.internal:8080/v1. */
  baseUrl?: string;
  /** Optional file (PDF or image) for OCR / vision. */
  attachment?: { mediaType: string; base64: string; fileName: string };
}

export interface ProviderResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export class ProviderError extends Error {
  constructor(public provider: ProviderId, message: string, public status?: number) {
    super(message);
  }
}

/** Claude models that take output_config.effort and think adaptively (output tokens include thinking). */
function claudeAdaptive(model: string): boolean {
  return /claude-(opus|sonnet|haiku|fable|mythos)-5/.test(model) || /claude-opus-4-[678]/.test(model) || /claude-sonnet-4-6/.test(model);
}

async function callAnthropic(c: ProviderCall): Promise<ProviderResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: c.apiKey });
  const adaptive = claudeAdaptive(c.model);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];
  if (c.attachment) {
    const source = { type: "base64", media_type: c.attachment.mediaType, data: c.attachment.base64 };
    content.push(c.attachment.mediaType === "application/pdf" ? { type: "document", source } : { type: "image", source });
  }
  content.push({ type: "text", text: c.prompt });
  try {
    const msg = await client.messages.create({
      model: c.model,
      // Adaptive-thinking models spend part of the output budget on thinking: leave headroom.
      max_tokens: adaptive ? Math.max(c.maxTokens * 2, c.maxTokens + 4000) : c.maxTokens,
      ...(c.system ? { system: c.system } : {}),
      ...(adaptive ? { output_config: { effort: c.tier === "high" ? "medium" : "low" } } : {}),
      messages: [{ role: "user", content }],
    } as Parameters<typeof client.messages.create>[0]) as import("@anthropic-ai/sdk").default.Message;
    if (msg.stop_reason === "refusal") throw new ProviderError("anthropic", "Claude từ chối yêu cầu (refusal).");
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("\n").trim();
    return { text, inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0 };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e instanceof Anthropic.APIError) throw new ProviderError("anthropic", e.message, e.status);
    throw new ProviderError("anthropic", e instanceof Error ? e.message : String(e));
  }
}

async function postJson(provider: ProviderId, url: string, headers: Record<string, string>, body: unknown, timeoutMs = 280_000): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new ProviderError(provider, err?.message ?? `HTTP ${res.status}`, res.status);
  }
  return json;
}

async function callOpenAI(c: ProviderCall): Promise<ProviderResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any = c.attachment
    ? [
        c.attachment.mediaType === "application/pdf"
          ? { type: "file", file: { filename: c.attachment.fileName, file_data: `data:application/pdf;base64,${c.attachment.base64}` } }
          : { type: "image_url", image_url: { url: `data:${c.attachment.mediaType};base64,${c.attachment.base64}` } },
        { type: "text", text: c.prompt },
      ]
    : c.prompt;
  const json = await postJson("openai", "https://api.openai.com/v1/chat/completions", { Authorization: `Bearer ${c.apiKey}` }, {
    model: c.model,
    max_completion_tokens: c.maxTokens + 4000, // reasoning models count hidden reasoning in completion tokens
    messages: [...(c.system ? [{ role: "system", content: c.system }] : []), { role: "user", content: userContent }],
  });
  const choice = (json.choices as Array<{ message?: { content?: string; refusal?: string } }> | undefined)?.[0];
  if (choice?.message?.refusal) throw new ProviderError("openai", `OpenAI từ chối: ${choice.message.refusal}`);
  const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  return { text: (choice?.message?.content ?? "").trim(), inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0 };
}

async function callGemini(c: ProviderCall): Promise<ProviderResult> {
  const model = c.model.replace(/^models\//, "");
  const parts: Array<Record<string, unknown>> = [];
  if (c.attachment) parts.push({ inlineData: { mimeType: c.attachment.mediaType, data: c.attachment.base64 } });
  parts.push({ text: c.prompt });
  const json = await postJson("gemini", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": c.apiKey }, {
    ...(c.system ? { systemInstruction: { parts: [{ text: c.system }] } } : {}),
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: c.maxTokens + 4000 },
  });
  const cand = (json.candidates as Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }> | undefined)?.[0];
  if (!cand) {
    const fb = json.promptFeedback as { blockReason?: string } | undefined;
    throw new ProviderError("gemini", `Gemini không trả kết quả${fb?.blockReason ? ` (${fb.blockReason})` : ""}.`);
  }
  const text = (cand.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  const u = json.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined;
  return { text, inputTokens: u?.promptTokenCount ?? 0, outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) };
}

/** Turn a network failure into a message an admin can act on (LocalAI off, wrong address, model still loading). */
function localAiNetworkError(e: unknown, baseUrl: string): ProviderError {
  if (e instanceof ProviderError) return e;
  const err = e as { name?: string; message?: string; cause?: { code?: string } };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return new ProviderError("localai", `LocalAI không trả lời sau ${Math.round(LOCALAI_TIMEOUT_MS / 1000)} giây (mô hình đang nạp hoặc câu hỏi quá dài).`);
  }
  const code = err?.cause?.code ? ` (${err.cause.code})` : "";
  return new ProviderError("localai", `Không kết nối được LocalAI tại ${baseUrl}${code} – kiểm tra LocalAI đã bật và địa chỉ đúng.`);
}

/**
 * LocalAI speaks the OpenAI chat API. The installed models are "thinking" models: thinking is switched off via
 * chat_template_kwargs, and only message.content is used (message.reasoning is never shown as the answer).
 */
async function callLocalAI(c: ProviderCall): Promise<ProviderResult> {
  if (c.attachment) throw new ProviderError("localai", "LocalAI (máy chủ nội bộ) chưa hỗ trợ đọc tệp PDF/ảnh (OCR) – cần Claude, OpenAI hoặc Gemini cho việc này.");
  if (!c.baseUrl) throw new ProviderError("localai", "Chưa cấu hình địa chỉ LocalAI.");
  const base = normalizeBaseUrl(c.baseUrl);
  let json: Record<string, unknown>;
  try {
    json = await postJson("localai", `${base}/chat/completions`, c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}, {
      model: c.model,
      max_tokens: c.maxTokens,
      temperature: 0.3,
      chat_template_kwargs: { enable_thinking: false },
      messages: [...(c.system ? [{ role: "system", content: c.system }] : []), { role: "user", content: c.prompt }],
    }, LOCALAI_TIMEOUT_MS);
  } catch (e) {
    throw localAiNetworkError(e, base);
  }
  const choice = (json.choices as Array<{ message?: { content?: string | null; reasoning?: string; reasoning_content?: string }; finish_reason?: string }> | undefined)?.[0];
  const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  // Some templates still emit <think>…</think> inline: strip it.
  const text = (choice?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text && (choice?.message?.reasoning || choice?.message?.reasoning_content)) {
    throw new ProviderError("localai", `Mô hình ${c.model} dùng hết ${c.maxTokens} token cho phần suy nghĩ, chưa có câu trả lời – tăng giới hạn token hoặc chọn mô hình khác.`);
  }
  return { text, inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0 };
}

export async function callProvider(c: ProviderCall): Promise<ProviderResult> {
  if (c.provider === "anthropic") return callAnthropic(c);
  if (c.provider === "openai") return callOpenAI(c);
  if (c.provider === "localai") return callLocalAI(c);
  return callGemini(c);
}

/** Text-generation models the key can use (for the model pickers on the config page). */
export async function listModels(provider: ProviderId, apiKey: string, baseUrl?: string): Promise<string[]> {
  if (provider === "localai") {
    if (!baseUrl) throw new ProviderError("localai", "Chưa cấu hình địa chỉ LocalAI.");
    const base = normalizeBaseUrl(baseUrl);
    let res: Response;
    try {
      res = await fetch(`${base}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      throw localAiNetworkError(e, base);
    }
    const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id: string }>; error?: { message?: string } };
    if (!res.ok) throw new ProviderError("localai", json.error?.message ?? `HTTP ${res.status}`, res.status);
    return (json.data ?? []).map((m) => m.id).filter((id) => !NON_CHAT_MODEL.test(id)).sort();
  }
  if (provider === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const ids: string[] = [];
    for await (const m of client.models.list()) ids.push(m.id);
    return ids;
  }
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20_000) });
    const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id: string }>; error?: { message?: string } };
    if (!res.ok) throw new ProviderError("openai", json.error?.message ?? `HTTP ${res.status}`, res.status);
    return (json.data ?? []).map((m) => m.id).filter((id) => /^(gpt|o\d|chatgpt)/i.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding)/i.test(id)).sort();
  }
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(20_000) });
  const json = (await res.json().catch(() => ({}))) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }>; error?: { message?: string } };
  if (!res.ok) throw new ProviderError("gemini", json.error?.message ?? `HTTP ${res.status}`, res.status);
  return (json.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, "")).filter((n) => /^gemini/.test(n)).sort();
}
