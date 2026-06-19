import { prisma } from "../db";
import { aiComplete, type AiResult } from "./client";
import { cosineSimilarity, embedText, tokenize } from "./embeddings";

const SYSTEM_QA = `Bạn là trợ lý đảm bảo chất lượng và kiểm định chương trình đào tạo (AIQMS3).
Nguyên tắc: chỉ hỗ trợ, gợi ý; con người kiểm tra và phê duyệt. Trả lời bằng tiếng Việt, học thuật, khách quan.
Khi được cung cấp ngữ cảnh/minh chứng, chỉ dựa vào ngữ cảnh đó; nếu thiếu dữ liệu hãy nói rõ là chưa đủ căn cứ.`;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Heuristic extractive summary used when no AI key is configured. */
function heuristicSummary(text: string, maxSentences = 4): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "(Không trích xuất được nội dung văn bản từ tài liệu.)";
  const sentences = clean.split(/(?<=[.!?。])\s+/).filter((s) => s.length > 30);
  return sentences.slice(0, maxSentences).join(" ") || truncate(clean, 400);
}

// ---------------------------------------------------------------------------
// 1. Summarise a document / evidence
// ---------------------------------------------------------------------------
export async function summarizeText(text: string, label?: string): Promise<AiResult> {
  const content = truncate(text || "", 12000);
  return aiComplete({
    system: SYSTEM_QA,
    maxTokens: 600,
    prompt: `Tóm tắt ngắn gọn (3-5 câu) nội dung minh chứng sau${label ? ` ("${label}")` : ""}, nêu rõ loại tài liệu, nội dung chính và giá trị phục vụ kiểm định:\n\n${content}`,
    fallback: () => heuristicSummary(text),
  });
}

// ---------------------------------------------------------------------------
// 2. Suggest accreditation criteria for an evidence text
// ---------------------------------------------------------------------------
export interface CriterionLite {
  id: string;
  code: string;
  title: string;
  description?: string | null;
}

export interface CriterionSuggestion {
  id: string;
  code: string;
  title: string;
  score: number;
}

export async function suggestCriteria(
  text: string,
  criteria: CriterionLite[],
): Promise<AiResult & { data: CriterionSuggestion[] }> {
  // Always compute a heuristic ranking (also used as fallback / cross-check).
  const textTokens = new Set(tokenize(text));
  const ranked = criteria
    .map((c) => {
      const cTokens = tokenize(`${c.title} ${c.description ?? ""}`);
      const overlap = cTokens.filter((t) => textTokens.has(t)).length;
      const score = cTokens.length ? overlap / Math.sqrt(cTokens.length) : 0;
      return { id: c.id, code: c.code, title: c.title, score: Number(score.toFixed(3)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .filter((c) => c.score > 0);

  const list = criteria.map((c) => `${c.code}: ${c.title}`).join("\n");
  const result = await aiComplete({
    system: SYSTEM_QA,
    maxTokens: 500,
    prompt: `Dưới đây là danh mục tiêu chí kiểm định:\n${list}\n\nNội dung minh chứng:\n${truncate(text, 6000)}\n\nHãy gợi ý 3-5 tiêu chí phù hợp nhất (theo mã), kèm lý do ngắn gọn cho từng tiêu chí.`,
    fallback: () =>
      ranked.length
        ? "Gợi ý dựa trên độ tương đồng từ khóa (chưa bật AI):\n" +
          ranked.map((r) => `• ${r.code} — ${r.title} (điểm ${r.score})`).join("\n")
        : "Chưa đủ dữ liệu văn bản để gợi ý tiêu chí. Hãy bổ sung mô tả hoặc tải lại tài liệu có nội dung trích xuất được.",
  });

  return { ...result, data: ranked };
}

// ---------------------------------------------------------------------------
// 3. Draft a self-assessment report section
// ---------------------------------------------------------------------------
export async function draftReportSection(input: {
  criterionCode?: string;
  criterionTitle: string;
  evidenceSummaries: string[];
  notes?: string;
}): Promise<AiResult> {
  const evidence = input.evidenceSummaries.length
    ? input.evidenceSummaries.map((e, i) => `[MC${i + 1}] ${e}`).join("\n")
    : "(Chưa có minh chứng được liên kết.)";

  return aiComplete({
    system: SYSTEM_QA,
    maxTokens: 1500,
    prompt: `Soạn bản nháp nội dung báo cáo tự đánh giá cho tiêu chí ${input.criterionCode ?? ""} "${input.criterionTitle}".
Cấu trúc gồm: (1) Mô tả hiện trạng, (2) Phân tích dựa trên minh chứng, (3) Điểm mạnh, (4) Tồn tại, (5) Kế hoạch cải tiến.
Chỉ sử dụng thông tin từ minh chứng dưới đây; nếu thiếu dữ liệu định lượng thì ghi rõ "cần bổ sung số liệu".
${input.notes ? `Ghi chú: ${input.notes}\n` : ""}
Minh chứng:\n${evidence}`,
    fallback: () =>
      `# Bản nháp tiêu chí ${input.criterionCode ?? ""}: ${input.criterionTitle}\n\n` +
      `**Mô tả hiện trạng:** (soạn dựa trên ${input.evidenceSummaries.length} minh chứng đã liên kết).\n\n` +
      `**Phân tích:**\n${evidence}\n\n` +
      `**Điểm mạnh:** cần bổ sung.\n\n**Tồn tại:** cần bổ sung số liệu định lượng.\n\n` +
      `**Kế hoạch cải tiến:** cần bổ sung.\n\n_(Bản nháp tạo bằng quy tắc — bật ANTHROPIC_API_KEY để dùng AI đầy đủ.)_`,
  });
}

// ---------------------------------------------------------------------------
// 4. Review a self-assessment report section (AI Review SAR)
// ---------------------------------------------------------------------------
export async function reviewReportSection(input: {
  title: string;
  content?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  improvementPlan?: string | null;
  linkedEvidenceCount: number;
}): Promise<AiResult> {
  const issuesFallback: string[] = [];
  if (!input.content || input.content.trim().length < 80) issuesFallback.push("Phần mô tả/phân tích còn quá ngắn hoặc trống.");
  if (input.linkedEvidenceCount === 0) issuesFallback.push("Chưa có minh chứng được liên kết với tiêu chí này.");
  if (!input.strengths?.trim()) issuesFallback.push("Chưa nêu điểm mạnh.");
  if (!input.weaknesses?.trim()) issuesFallback.push("Chưa nêu tồn tại.");
  if (!input.improvementPlan?.trim()) issuesFallback.push("Chưa có kế hoạch cải tiến.");
  if (input.content && !/\d/.test(input.content)) issuesFallback.push("Nội dung chưa có số liệu định lượng cụ thể.");

  return aiComplete({
    system: SYSTEM_QA,
    maxTokens: 800,
    prompt: `Rà soát chất lượng phần báo cáo tự đánh giá "${input.title}" và liệt kê các vấn đề (mỗi vấn đề một dòng), tập trung: nội dung chung chung, nhận định thiếu minh chứng/số liệu, thiếu điểm mạnh/tồn tại/kế hoạch cải tiến, mâu thuẫn.
Số minh chứng đã liên kết: ${input.linkedEvidenceCount}.

NỘI DUNG:
${input.content ?? "(trống)"}

ĐIỂM MẠNH: ${input.strengths ?? "(trống)"}
TỒN TẠI: ${input.weaknesses ?? "(trống)"}
KẾ HOẠCH CẢI TIẾN: ${input.improvementPlan ?? "(trống)"}`,
    fallback: () =>
      issuesFallback.length
        ? "Phát hiện các điểm cần xử lý:\n" + issuesFallback.map((i) => `• ${i}`).join("\n")
        : "Không phát hiện vấn đề rõ ràng theo quy tắc cơ bản. Vẫn nên có người rà soát chuyên môn.",
  });
}

// ---------------------------------------------------------------------------
// 5. Analyse survey open-ended feedback
// ---------------------------------------------------------------------------
export async function analyzeSurvey(input: {
  title: string;
  audience: string;
  openAnswers: string[];
  averageScore?: number | null;
}): Promise<AiResult> {
  const answers = input.openAnswers.filter(Boolean);
  return aiComplete({
    system: SYSTEM_QA,
    maxTokens: 900,
    prompt: `Phân tích phản hồi khảo sát "${input.title}" (đối tượng: ${input.audience}).
Hãy: (1) tóm tắt, (2) phân nhóm ý kiến theo chủ đề, (3) nêu vấn đề nổi bật được nhắc nhiều, (4) gợi ý hành động cải tiến và liên kết tới PLO/học phần nếu phù hợp.
${input.averageScore != null ? `Điểm trung bình (thang Likert): ${input.averageScore.toFixed(2)}.\n` : ""}
Các câu trả lời mở:\n${answers.map((a, i) => `${i + 1}. ${a}`).join("\n") || "(không có)"}`,
    fallback: () => {
      if (!answers.length) return "Chưa có phản hồi mở để phân tích.";
      const freq = new Map<string, number>();
      for (const a of answers) for (const t of tokenize(a)) freq.set(t, (freq.get(t) || 0) + 1);
      const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      return (
        `Tổng hợp ${answers.length} phản hồi (chưa bật AI).\n` +
        `Từ khóa nổi bật: ${top.map(([w, c]) => `${w}(${c})`).join(", ")}.\n` +
        `Gợi ý: rà soát các chủ đề lặp lại nhiều lần ở trên và đối chiếu với chuẩn đầu ra liên quan.`
      );
    },
  });
}

// ---------------------------------------------------------------------------
// 6. Suggest improvement actions (PDCA)
// ---------------------------------------------------------------------------
export async function suggestImprovements(input: {
  problem: string;
  criterionTitle?: string;
  context?: string;
}): Promise<AiResult> {
  return aiComplete({
    system: SYSTEM_QA,
    maxTokens: 700,
    prompt: `Vấn đề/tồn tại: "${input.problem}".${input.criterionTitle ? ` Liên quan tiêu chí: ${input.criterionTitle}.` : ""}
Đề xuất kế hoạch cải tiến theo PDCA gồm: nguyên nhân khả dĩ, 3-5 hành động cụ thể, đơn vị phụ trách phù hợp, chỉ số đánh giá (KPI) và minh chứng cần thu thập sau cải tiến.
${input.context ? `Bối cảnh: ${input.context}` : ""}`,
    fallback: () =>
      `Gợi ý cải tiến cho: "${input.problem}" (chưa bật AI)\n` +
      `1. Rà soát nguyên nhân gốc rễ với đơn vị liên quan.\n` +
      `2. Xác định 2-3 hành động cụ thể, có thời hạn.\n` +
      `3. Phân công đơn vị phụ trách và KPI đo lường.\n` +
      `4. Thu thập minh chứng trước/sau cải tiến.\n` +
      `5. Đánh giá lại sau 1-2 học kỳ (chu trình PDCA).`,
  });
}

// ---------------------------------------------------------------------------
// 7. RAG retrieval + answer (internal accreditation Q&A chatbot)
// ---------------------------------------------------------------------------
export interface RetrievedChunk {
  content: string;
  evidenceId: string | null;
  evidenceCode: string | null;
  evidenceTitle: string | null;
  score: number;
}

export async function ragRetrieve(programId: string, question: string, k = 5): Promise<RetrievedChunk[]> {
  const chunks = await prisma.documentChunk.findMany({
    where: { document: { programId } },
    select: {
      content: true,
      embedding: true,
      document: { select: { evidence: { select: { id: true, code: true, title: true } } } },
    },
    take: 800,
  });
  const qv = embedText(question);
  return chunks
    .map((c) => ({
      content: c.content,
      evidenceId: c.document.evidence?.id ?? null,
      evidenceCode: c.document.evidence?.code ?? null,
      evidenceTitle: c.document.evidence?.title ?? null,
      score: cosineSimilarity(qv, c.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((c) => c.score > 0.02);
}

export async function ragAnswer(
  programId: string,
  question: string,
): Promise<AiResult & { citations: RetrievedChunk[] }> {
  const top = await ragRetrieve(programId, question, 5);
  const context = top
    .map((c, i) => `[${i + 1}] (Minh chứng ${c.evidenceCode ?? "?"}: ${c.evidenceTitle ?? "?"})\n${truncate(c.content, 800)}`)
    .join("\n\n");

  const result = await aiComplete({
    system: SYSTEM_QA,
    maxTokens: 900,
    prompt: `Câu hỏi: ${question}\n\nNgữ cảnh từ kho minh chứng của chương trình:\n${context || "(không tìm thấy minh chứng liên quan)"}\n\nTrả lời dựa trên ngữ cảnh, trích dẫn số [n] tương ứng. Nếu ngữ cảnh không đủ, hãy nói rõ minh chứng còn thiếu.`,
    fallback: () =>
      top.length
        ? `Tìm thấy ${top.length} đoạn minh chứng liên quan (chưa bật AI):\n\n` +
          top.map((c, i) => `[${i + 1}] ${c.evidenceCode ?? ""} ${c.evidenceTitle ?? ""}:\n"${truncate(c.content, 300)}"`).join("\n\n")
        : "Chưa tìm thấy minh chứng liên quan trong kho dữ liệu của chương trình. Hãy tải lên và xử lý tài liệu trước.",
  });

  return { ...result, citations: top };
}
