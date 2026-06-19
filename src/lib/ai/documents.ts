import { prisma } from "../db";
import { chunkText, embedText } from "./embeddings";

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

/**
 * Process an uploaded evidence file: extract text, chunk it, create embeddings,
 * and persist Document + DocumentChunk rows for the RAG layer.
 */
export async function processEvidenceDocument(opts: {
  evidenceId: string;
  programId?: string | null;
  buffer: Buffer;
  fileName: string;
  fileType?: string;
}): Promise<{ documentId: string; chunkCount: number; text: string }> {
  const text = await extractText(opts.buffer, opts.fileType, opts.fileName);

  const document = await prisma.document.upsert({
    where: { evidenceId: opts.evidenceId },
    update: { extractedText: text, language: detectLanguage(text), status: "READY" },
    create: {
      evidenceId: opts.evidenceId,
      programId: opts.programId ?? null,
      fileName: opts.fileName,
      fileType: opts.fileType,
      extractedText: text,
      language: detectLanguage(text),
      status: "READY",
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
  }

  return { documentId: document.id, chunkCount: chunks.length, text };
}
