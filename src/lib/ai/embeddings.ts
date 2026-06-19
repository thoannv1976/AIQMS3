// Lightweight, dependency-free embeddings for the MVP RAG layer.
// A hashed bag-of-words vector — deterministic, offline, good enough to retrieve the
// right evidence chunk for the internal Q&A chatbot. Production should swap this for
// a real embedding provider (Vertex AI / Voyage) + pgvector (see docs).

export const EMBEDDING_DIM = 256;

const VI_STOPWORDS = new Set([
  "và","là","của","có","các","được","cho","trong","với","này","đã","khi","về","theo",
  "một","những","để","từ","đến","ra","vào","cũng","như","thì","mà","ở","tại","nên",
  "the","a","an","of","to","in","for","and","or","is","are","on","with","by","at",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !VI_STOPWORDS.has(t));
}

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function embedText(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return v;
  for (const t of tokens) {
    v[hashToken(t) % EMBEDDING_DIM] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are already L2-normalised
}

/** Split a long text into overlapping chunks (~maxChars each) on sentence boundaries. */
export function chunkText(text: string, maxChars = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];

  const chunks: string[] = [];
  const sentences = clean.split(/(?<=[.!?。\n])\s+/);
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).length > maxChars && current) {
      chunks.push(current.trim());
      current = current.slice(Math.max(0, current.length - overlap)) + " " + s;
    } else {
      current += (current ? " " : "") + s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
