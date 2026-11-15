import { prisma } from "../db";
import { chunkText, embedText } from "./embeddings";
import { indexDocumentVectors, pgVectorEnabled } from "./vector";
import { aiTranscribe, imageMediaType, OCR_MAX_PAGES } from "./ocr";

/** Minimum characters of real text before a PDF counts as having a text layer. */
const MIN_TEXT_CHARS = 80;

async function extractPptx(buffer: Buffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const slideNo = (n: string) => Number(n.match(/(\d+)\.xml$/)?.[1] ?? 0);
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b));
  const out: string[] = [];
  for (const name of slides) {
    const xml = await zip.files[name].async("string");
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    const decoded = texts.join(" ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    out.push(`# Slide ${slideNo(name)}\n${decoded}`);
  }
  return out.join("\n\n");
}

async function pdfPageCount(buffer: Buffer): Promise<number> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    return pdf.numPages;
  } catch {
    return 0;
  }
}

/**
 * Extract text; for images, or PDFs without a text layer (scans), fall back to Claude OCR.
 * Returns the text plus whether OCR was used.
 */
export async function extractTextWithOcr(
  buffer: Buffer,
  fileType: string | undefined,
  fileName: string,
): Promise<{ text: string; ocr: boolean }> {
  if (imageMediaType(fileName)) {
    const text = await aiTranscribe(buffer, fileName, "image");
    return { text, ocr: Boolean(text) };
  }
  const text = await extractText(buffer, fileType, fileName);
  const isPdf = (fileType || "").includes("pdf") || fileName.toLowerCase().endsWith(".pdf");
  if (isPdf && text.replace(/\s+/g, "").length < MIN_TEXT_CHARS) {
    const pages = await pdfPageCount(buffer);
    if (pages > 0 && pages <= OCR_MAX_PAGES) {
      const ocrText = await aiTranscribe(buffer, fileName, "pdf");
      if (ocrText) return { text: ocrText, ocr: true };
    }
  }
  return { text, ocr: false };
}

// Extract plain text from common evidence file types. All parsers are dynamically
// imported so they only load on the server when actually needed.
export async function extractText(buffer: Buffer, fileType: string | undefined, fileName: string): Promise<string> {
  const type = (fileType || "").toLowerCase();
  const name = fileName.toLowerCase();
  try {
    if (type.includes("pdf") || name.endsWith(".pdf")) {
      const { extractText: pdfExtract, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await pdfExtract(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text;
    }
    if (name.endsWith(".docx") || type.includes("word") || type.includes("wordprocessing")) {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer });
      return res.value;
    }
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || type.includes("sheet") || type.includes("excel")) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer" });
      let out = "";
      for (const sheetName of wb.SheetNames) {
        out += `# ${sheetName}\n${XLSX.utils.sheet_to_csv(wb.Sheets[sheetName])}\n\n`;
      }
      return out;
    }
    if (name.endsWith(".pptx") || type.includes("presentation")) {
      return await extractPptx(buffer);
    }
    if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv") || type.startsWith("text/")) {
      return buffer.toString("utf-8");
    }
  } catch (err) {
    console.error("[documents] extraction failed for", fileName, err);
  }
  return "";
}

/** Detect the dominant language (very rough) for metadata. */
function detectLanguage(text: string): string {
  const viChars = (text.match(/[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũ]/gi) || []).length;
  return viChars > text.length * 0.01 ? "vi" : "en";
}

/** Document processing lifecycle (stored as Document.status). */
export const DOC_STATUS = { PENDING: "PENDING", PROCESSING: "PROCESSING", READY: "READY", FAILED: "FAILED" } as const;

/** Create/flag a Document placeholder as PROCESSING so the UI reflects it immediately. */
export async function markDocumentProcessing(opts: {
  evidenceId: string;
  programId?: string | null;
  fileName: string;
  fileType?: string | null;
}): Promise<void> {
  await prisma.document.upsert({
    where: { evidenceId: opts.evidenceId },
    update: { status: DOC_STATUS.PROCESSING },
    create: {
      evidenceId: opts.evidenceId,
      programId: opts.programId ?? null,
      fileName: opts.fileName,
      fileType: opts.fileType ?? null,
      status: DOC_STATUS.PROCESSING,
    },
  });
}

/** Flag a document as FAILED (called when background processing throws). */
export async function markDocumentFailed(evidenceId: string): Promise<void> {
  await prisma.document.updateMany({ where: { evidenceId }, data: { status: DOC_STATUS.FAILED } }).catch(() => {});
}

/**
 * Process an uploaded evidence file: extract text, chunk it, create embeddings,
 * and persist Document + DocumentChunk rows for the RAG layer. Sets status READY
 * only after chunks are written (so a crash mid-way leaves it non-READY).
 */
export async function processEvidenceDocument(opts: {
  evidenceId: string;
  programId?: string | null;
  buffer: Buffer;
  fileName: string;
  fileType?: string;
}): Promise<{ documentId: string; chunkCount: number; text: string; ocr: boolean }> {
  const { text, ocr } = await extractTextWithOcr(opts.buffer, opts.fileType, opts.fileName);
  if (ocr) {
    await prisma.aiAnalysisResult
      .create({
        data: { type: "OCR", targetType: "evidence", targetId: opts.evidenceId, result: `Đã OCR ${text.length} ký tự từ ${opts.fileName}` },
      })
      .catch(() => {});
  }

  const document = await prisma.document.upsert({
    where: { evidenceId: opts.evidenceId },
    update: { extractedText: text, language: detectLanguage(text), status: DOC_STATUS.PROCESSING },
    create: {
      evidenceId: opts.evidenceId,
      programId: opts.programId ?? null,
      fileName: opts.fileName,
      fileType: opts.fileType,
      extractedText: text,
      language: detectLanguage(text),
      status: DOC_STATUS.PROCESSING,
    },
  });

  // Reset existing chunks (re-processing) then create fresh ones.
  await prisma.documentChunk.deleteMany({ where: { documentId: document.id } });

  const chunks = chunkText(text);
  if (chunks.length > 0) {
    await prisma.documentChunk.createMany({
      data: chunks.map((content, i) => ({
        documentId: document.id,
        chunkIndex: i,
        content,
        tokenCount: content.split(/\s+/).length,
        embedding: embedText(content),
      })),
    });
    // Mirror into the pgvector column for fast search (no-op if pgvector is off).
    if (pgVectorEnabled()) {
      try {
        await indexDocumentVectors(document.id);
      } catch (err) {
        console.error("[documents] pgvector index sync failed:", err);
      }
    }
  }

  await prisma.document.update({ where: { id: document.id }, data: { status: DOC_STATUS.READY } });
  return { documentId: document.id, chunkCount: chunks.length, text, ocr };
}
