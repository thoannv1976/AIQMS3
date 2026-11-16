// OCR for scanned PDFs / images using Claude's document & vision input.
// Only used when normal text extraction returns (almost) nothing.
import { getAiConfig } from "./config";
import { estimateCostUsd, logAiUsage } from "./usage";

export const OCR_MAX_PDF_BYTES = 20 * 1024 * 1024;
export const OCR_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const OCR_MAX_PAGES = 30;

type ImageMedia = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
const IMAGE_TYPES: Record<string, ImageMedia> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function imageMediaType(fileName: string): ImageMedia | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return IMAGE_TYPES[ext] ?? null;
}

/** Transcribe a scanned PDF or an image. Returns "" when AI is off, the file is too big, or the call fails. */
export async function aiTranscribe(buffer: Buffer, fileName: string, kind: "pdf" | "image"): Promise<string> {
  const cfg = await getAiConfig();
  if (cfg.mode === "mock" || !cfg.apiKey) return "";
  const mediaType = kind === "pdf" ? "application/pdf" : imageMediaType(fileName);
  if (!mediaType) return "";
  if (kind === "pdf" && buffer.length > OCR_MAX_PDF_BYTES) return "";
  if (kind === "image" && buffer.length > OCR_MAX_IMAGE_BYTES) return "";

  const source = { type: "base64", media_type: mediaType, data: buffer.toString("base64") };
  const block = kind === "pdf" ? { type: "document", source } : { type: "image", source };

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const msg = await client.messages.create({
      model: cfg.model,
      max_tokens: 8000,
      system:
        "Bạn là công cụ OCR. Chép lại NGUYÊN VĂN toàn bộ chữ trong tài liệu (tiếng Việt có dấu), giữ thứ tự đọc, " +
        "giữ số hiệu văn bản, ngày tháng, bảng biểu (mỗi dòng một hàng, các ô phân cách bằng |). " +
        "Không tóm tắt, không bình luận, không thêm nội dung.",
      messages: [
        {
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [block as any, { type: "text", text: `Chép lại văn bản trong tệp "${fileName}".` }],
        },
      ],
    });
    const text = (msg.content as Array<{ type: string; text?: string }>)
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("\n")
      .trim();
    const inputTokens = msg.usage?.input_tokens ?? 0;
    const outputTokens = msg.usage?.output_tokens ?? 0;
    await logAiUsage({
      feature: "ocr",
      model: cfg.model,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(cfg.model, inputTokens, outputTokens),
      usedFallback: false,
      success: true,
    });
    return text;
  } catch (err) {
    console.error("[ocr] Claude transcription failed:", err);
    await logAiUsage({ feature: "ocr", model: cfg.model, inputTokens: 0, outputTokens: 0, costUsd: 0, usedFallback: true, success: false });
    return "";
  }
}
