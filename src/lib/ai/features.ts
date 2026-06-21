import { prisma } from "../db";
import { aiComplete, type AiResult, type AiMeta } from "./client";
import { cosineSimilarity, embedText, tokenize } from "./embeddings";
import { pgVectorEnabled, searchSimilar } from "./vector";

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
export async function summarizeText(text: string, label?: string, meta?: AiMeta): Promise<AiResult> {
  const content = truncate(text || "", 12000);
  return aiComplete({
    feature: "evidence_summary",
    userId: meta?.userId,
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
  meta?: AiMeta,
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
    feature: "criterion_suggestion",
    userId: meta?.userId,
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
}, meta?: AiMeta): Promise<AiResult> {
  const evidence = input.evidenceSummaries.length
    ? input.evidenceSummaries.map((e, i) => `[MC${i + 1}] ${e}`).join("\n")
    : "(Chưa có minh chứng được liên kết.)";

  return aiComplete({
    feature: "sar_draft",
    userId: meta?.userId,
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
}, meta?: AiMeta): Promise<AiResult> {
  const issuesFallback: string[] = [];
  if (!input.content || input.content.trim().length < 80) issuesFallback.push("Phần mô tả/phân tích còn quá ngắn hoặc trống.");
  if (input.linkedEvidenceCount === 0) issuesFallback.push("Chưa có minh chứng được liên kết với tiêu chí này.");
  if (!input.strengths?.trim()) issuesFallback.push("Chưa nêu điểm mạnh.");
  if (!input.weaknesses?.trim()) issuesFallback.push("Chưa nêu tồn tại.");
  if (!input.improvementPlan?.trim()) issuesFallback.push("Chưa có kế hoạch cải tiến.");
  if (input.content && !/\d/.test(input.content)) issuesFallback.push("Nội dung chưa có số liệu định lượng cụ thể.");

  return aiComplete({
    feature: "sar_review",
    userId: meta?.userId,
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
}, meta?: AiMeta): Promise<AiResult> {
  const answers = input.openAnswers.filter(Boolean);
  return aiComplete({
    feature: "survey_analysis",
    userId: meta?.userId,
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
}, meta?: AiMeta): Promise<AiResult> {
  return aiComplete({
    feature: "improvement_suggestion",
    userId: meta?.userId,
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
  const qv = embedText(question);

  // Fast path: vector search in Postgres (pgvector) — scales to very large corpora.
  if (pgVectorEnabled()) {
    try {
      const hits = await searchSimilar(programId, qv, k);
      const filtered = hits.filter((c) => c.score > 0.02);
      if (filtered.length) return filtered;
      // Empty (e.g. vectors not backfilled yet) → fall through to the in-app path.
    } catch (err) {
      console.error("[rag] pgvector search failed, using in-app cosine fallback:", err);
    }
  }

  // Fallback: in-app cosine over the Float[] embeddings (works without pgvector).
  const chunks = await prisma.documentChunk.findMany({
    where: { document: { programId } },
    select: {
      content: true,
      embedding: true,
      document: { select: { evidence: { select: { id: true, code: true, title: true } } } },
    },
    take: 800,
  });
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
  meta?: AiMeta,
): Promise<AiResult & { citations: RetrievedChunk[] }> {
  const top = await ragRetrieve(programId, question, 5);
  const context = top
    .map((c, i) => `[${i + 1}] (Minh chứng ${c.evidenceCode ?? "?"}: ${c.evidenceTitle ?? "?"})\n${truncate(c.content, 800)}`)
    .join("\n\n");

  const result = await aiComplete({
    feature: "rag_chat",
    userId: meta?.userId,
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

// ---------------------------------------------------------------------------
// 8. Gap analysis for a single accreditation criterion
// ---------------------------------------------------------------------------
export async function analyzeCriterionGap(
  input: {
    criterionCode: string;
    criterionTitle: string;
    readinessScore: number;
    sarStatusLabel: string;
    evidence: Array<{ code: string; title: string; statusLabel: string; strength: number }>;
    detectedGaps: string[];
  },
  meta?: AiMeta,
): Promise<AiResult> {
  const evidenceList = input.evidence.length
    ? input.evidence.map((e) => `- ${e.code} ${e.title} (trạng thái: ${e.statusLabel}, độ mạnh ${e.strength}/100)`).join("\n")
    : "(Chưa có minh chứng nào được liên kết.)";

  return aiComplete({
    feature: "gap_analysis",
    userId: meta?.userId,
    system: SYSTEM_QA,
    maxTokens: 800,
    prompt: `Phân tích khoảng trống minh chứng (gap analysis) cho tiêu chí kiểm định ${input.criterionCode} — "${input.criterionTitle}".
Mức sẵn sàng hiện tại: ${input.readinessScore}/100. Tình trạng mục SAR: ${input.sarStatusLabel}.

Minh chứng hiện có:
${evidenceList}

Khoảng trống tự động phát hiện:
${input.detectedGaps.length ? input.detectedGaps.map((g) => `- ${g}`).join("\n") : "- (không có)"}

Hãy trình bày: (1) minh chứng hiện đáp ứng được phần nào của tiêu chí; (2) những minh chứng/dữ liệu còn THIẾU theo yêu cầu AUN-QA; (3) đề xuất danh mục minh chứng cụ thể cần bổ sung (loại tài liệu, đơn vị cung cấp); (4) mức ưu tiên (cao/trung bình/thấp).`,
    fallback: () =>
      `Phân tích khoảng trống tiêu chí ${input.criterionCode} (chưa bật AI) — mức sẵn sàng ${input.readinessScore}/100.\n` +
      (input.detectedGaps.length
        ? "Cần xử lý:\n" + input.detectedGaps.map((g) => `• ${g}`).join("\n")
        : "Không phát hiện khoảng trống rõ ràng theo quy tắc cơ bản.") +
      `\nGợi ý: bổ sung minh chứng định lượng, biên bản/quyết định, và minh chứng cho thấy chu trình cải tiến (PDCA) cho tiêu chí này.`,
  });
}

// ---------------------------------------------------------------------------
// 9. Review curriculum coherence (PLO–CLO–Assessment–Rubric)
// ---------------------------------------------------------------------------
export async function reviewCurriculumLogic(
  input: {
    ploCount: number;
    cloCount: number;
    courseCount: number;
    coverage: Record<string, number>;
    issues: Array<{ severity: string; message: string }>;
  },
  meta?: AiMeta,
): Promise<AiResult> {
  const issueList = input.issues.length
    ? input.issues.map((i) => `- [${i.severity}] ${i.message}`).join("\n")
    : "(không phát hiện vấn đề tự động)";

  return aiComplete({
    feature: "curriculum_check",
    userId: meta?.userId,
    system: SYSTEM_QA,
    maxTokens: 900,
    prompt: `Rà soát tính nhất quán của chương trình đào tạo theo chuỗi PLO → CLO → Phương pháp đánh giá → Rubric (OBE/Constructive Alignment).
Quy mô: ${input.ploCount} PLO, ${input.courseCount} học phần, ${input.cloCount} CLO.
Độ phủ (%): ${Object.entries(input.coverage).map(([k, v]) => `${k}=${v}`).join(", ")}.

Vấn đề tự động phát hiện:
${issueList}

Hãy nhận định: (1) mức độ "constructive alignment" của chương trình; (2) các rủi ro lớn nhất về tính nhất quán; (3) 3–5 hành động khắc phục ưu tiên, gắn với đơn vị phụ trách.`,
    fallback: () =>
      input.issues.length
        ? `Rà soát logic CTĐT (chưa bật AI) — phát hiện ${input.issues.length} vấn đề:\n` +
          input.issues
            .slice(0, 12)
            .map((i) => `• [${i.severity}] ${i.message}`)
            .join("\n")
        : "Chuỗi PLO–CLO–Assessment–Rubric về cơ bản nhất quán theo các quy tắc kiểm tra tự động. Vẫn nên có rà soát chuyên môn của hội đồng.",
  });
}

// ---------------------------------------------------------------------------
// 10. Advanced SAR section review (quality-scored, evidence-aware)
// ---------------------------------------------------------------------------
export async function reviewReportSectionAdvanced(
  input: {
    title: string;
    content?: string | null;
    strengths?: string | null;
    weaknesses?: string | null;
    improvementPlan?: string | null;
    qualityScore: number;
    failedChecks: string[];
    evidenceSummaries: string[];
  },
  meta?: AiMeta,
): Promise<AiResult> {
  const evidence = input.evidenceSummaries.length
    ? input.evidenceSummaries.map((e, i) => `[MC${i + 1}] ${e}`).join("\n")
    : "(Chưa có minh chứng được liên kết.)";

  return aiComplete({
    feature: "sar_review_adv",
    userId: meta?.userId,
    system: SYSTEM_QA,
    maxTokens: 1000,
    prompt: `Rà soát CHẤT LƯỢNG nâng cao cho mục báo cáo tự đánh giá "${input.title}".
Điểm chất lượng tự động: ${input.qualityScore}/100. Tiêu chí chưa đạt: ${input.failedChecks.length ? input.failedChecks.join("; ") : "(không)"}.

NỘI DUNG: ${input.content ?? "(trống)"}
ĐIỂM MẠNH: ${input.strengths ?? "(trống)"}
TỒN TẠI: ${input.weaknesses ?? "(trống)"}
KẾ HOẠCH CẢI TIẾN: ${input.improvementPlan ?? "(trống)"}

MINH CHỨNG LIÊN KẾT:
${evidence}

Hãy: (1) đánh giá từng phần (mô tả, phân tích, điểm mạnh, tồn tại, cải tiến); (2) chỉ ra các NHẬN ĐỊNH CHƯA CÓ MINH CHỨNG/SỐ LIỆU hỗ trợ; (3) phát hiện mâu thuẫn hoặc nội dung chung chung; (4) gợi ý câu/đoạn nên viết lại để tăng tính thuyết phục theo yêu cầu kiểm định.`,
    fallback: () =>
      `Rà soát SAR nâng cao (chưa bật AI) — điểm chất lượng ${input.qualityScore}/100.\n` +
      (input.failedChecks.length
        ? "Cần khắc phục:\n" + input.failedChecks.map((c) => `• ${c}`).join("\n")
        : "Các tiêu chí cơ bản đã đạt. Nên rà soát thêm tính nhất quán giữa nhận định và minh chứng.") +
      `\nGợi ý: mỗi nhận định nên kèm dẫn chiếu tới minh chứng [MCx] và số liệu cụ thể.`,
  });
}

// ---------------------------------------------------------------------------
// 11. Automatic syllabus review (completeness + constructive alignment)
// ---------------------------------------------------------------------------
export async function reviewSyllabus(
  input: {
    courseCode: string;
    courseName: string;
    objectives?: string | null;
    content?: string | null;
    teachingMethods?: string | null;
    assessmentMethods?: string | null;
    clos: string[];
    ploLinks: string[];
    completeness: number;
    issues: string[];
  },
  meta?: AiMeta,
): Promise<AiResult> {
  return aiComplete({
    feature: "syllabus_review",
    userId: meta?.userId,
    system: SYSTEM_QA,
    maxTokens: 1000,
    prompt: `Rà soát đề cương học phần ${input.courseCode} — "${input.courseName}". Mức đầy đủ tự động: ${input.completeness}/100.

Mục tiêu: ${input.objectives ?? "(trống)"}
Nội dung: ${truncate(input.content ?? "(trống)", 2000)}
Phương pháp giảng dạy: ${input.teachingMethods ?? "(trống)"}
Phương pháp đánh giá: ${input.assessmentMethods ?? "(trống)"}
CLO: ${input.clos.length ? input.clos.join(" | ") : "(chưa có)"}
PLO mà học phần đóng góp: ${input.ploLinks.length ? input.ploLinks.join(", ") : "(chưa có)"}
Vấn đề tự động phát hiện: ${input.issues.length ? input.issues.join("; ") : "(không)"}

Hãy đánh giá: (1) tính đầy đủ của đề cương; (2) sự tương thích kiến tạo (constructive alignment) giữa CLO – phương pháp giảng dạy – phương pháp đánh giá; (3) CLO có đo lường được không (động từ Bloom); (4) đề xuất chỉnh sửa cụ thể để chuẩn hoá theo CDIO/OBE.`,
    fallback: () =>
      `Rà soát đề cương ${input.courseCode} (chưa bật AI) — mức đầy đủ ${input.completeness}/100.\n` +
      (input.issues.length
        ? "Vấn đề:\n" + input.issues.map((i) => `• ${i}`).join("\n")
        : "Đề cương cơ bản đầy đủ. Nên kiểm tra động từ Bloom của CLO và đối sánh CLO ↔ phương pháp đánh giá."),
  });
}

// ---------------------------------------------------------------------------
// 12. Draft an institutional response to an external-review recommendation
// ---------------------------------------------------------------------------
export async function draftRecommendationResponse(
  input: { content: string; criterionTitle?: string | null; priority?: string },
  meta?: AiMeta,
): Promise<AiResult> {
  return aiComplete({
    feature: "external_response",
    userId: meta?.userId,
    system: SYSTEM_QA,
    maxTokens: 700,
    prompt: `Soạn nội dung GIẢI TRÌNH của đơn vị đối với khuyến nghị từ đoàn đánh giá ngoài.
Khuyến nghị: "${input.content}".${input.criterionTitle ? ` Liên quan tiêu chí: ${input.criterionTitle}.` : ""}${input.priority ? ` Mức ưu tiên: ${input.priority}.` : ""}

Cấu trúc giải trình: (1) tiếp thu/làm rõ khuyến nghị; (2) hiện trạng và nguyên nhân; (3) hành động khắc phục theo PDCA (việc cụ thể, đơn vị phụ trách); (4) mốc thời gian và minh chứng sẽ bổ sung. Văn phong trang trọng, khách quan.`,
    fallback: () =>
      `Giải trình (bản nháp quy tắc — chưa bật AI):\n` +
      `1. Đơn vị tiếp thu khuyến nghị: "${input.content}".\n` +
      `2. Hiện trạng: cần rà soát và bổ sung minh chứng liên quan.\n` +
      `3. Hành động khắc phục: xây dựng kế hoạch cải tiến PDCA, phân công đơn vị phụ trách.\n` +
      `4. Mốc thời gian: hoàn thành trong học kỳ tới; bổ sung minh chứng sau cải tiến.`,
  });
}
