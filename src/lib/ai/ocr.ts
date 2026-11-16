// OCR for scanned PDFs / images using the configured AI provider's document & vision input.
// Only used when normal text extraction returns (almost) nothing.
import { aiComplete } from "./client";

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

/**
 * Transcribe a scanned PDF or an image with the economy-tier provider (any of Claude / OpenAI / Gemini that
 * accepts the file). Returns "" when AI is off, the file is too big, the budget is reached, or the call fails.
 */
export async function aiTranscribe(buffer: Buffer, fileName: string, kind: "pdf" | "image"): Promise<string> {
  const mediaType = kind === "pdf" ? "application/pdf" : imageMediaType(fileName);
  if (!mediaType) return "";
  if (kind === "pdf" && buffer.length > OCR_MAX_PDF_BYTES) return "";
  if (kind === "image" && buffer.length > OCR_MAX_IMAGE_BYTES) return "";
  const res = await aiComplete({
    feature: "ocr",
    tier: "economy",
    maxTokens: 8000,
    system:
      "Bạn là công cụ OCR. Chép lại NGUYÊN VĂN toàn bộ chữ trong tài liệu (tiếng Việt có dấu), giữ thứ tự đọc, " +
      "giữ số hiệu văn bản, ngày tháng, bảng biểu (mỗi dòng một hàng, các ô phân cách bằng |). " +
      "Không tóm tắt, không bình luận, không thêm nội dung.",
    prompt: `Chép lại văn bản trong tệp "${fileName}".`,
    attachment: { mediaType, base64: buffer.toString("base64"), fileName },
    fallback: () => "",
  });
  return res.usedFallback ? "" : res.text;
}
