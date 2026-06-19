// Thin wrapper around the Anthropic Claude API with a safe deterministic fallback.
// Principle from the spec: AI only *suggests*; humans review and approve. Every call
// reports whether the real model or the local fallback was used (human-in-the-loop).

export interface AiResult {
  text: string;
  usedFallback: boolean;
  model: string;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
}

/**
 * Run a single completion. When ANTHROPIC_API_KEY is absent (or the call fails),
 * `fallback()` is used so the feature keeps working offline for demos/pilots.
 */
export async function aiComplete(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  fallback: () => string;
}): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = aiModel();

  if (!apiKey) {
    return { text: opts.fallback(), usedFallback: true, model: "fallback-heuristic" };
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    });
    const text = (msg.content as Array<{ type: string; text?: string }>)
      .map((b) => (b.type === "text" ? b.text ?? "" : ""))
      .join("\n")
      .trim();
    return { text: text || opts.fallback(), usedFallback: false, model };
  } catch (err) {
    console.error("[ai] Claude call failed, using fallback:", err);
    return { text: opts.fallback(), usedFallback: true, model: "fallback-heuristic" };
  }
}
