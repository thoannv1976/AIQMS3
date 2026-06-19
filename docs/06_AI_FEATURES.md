# 06 — AI Features Spec

Lớp AI: `src/lib/ai/` — `client.ts` (Claude + fallback), `embeddings.ts` (vector + chunk),
`documents.ts` (trích xuất văn bản), `features.ts` (tính năng cấp cao).

## Nguyên tắc
- **Human-in-the-loop:** AI chỉ gợi ý; người phê duyệt. Kết quả lưu `AiAnalysisResult` với `usedFallback`.
- **Fallback an toàn:** không có `ANTHROPIC_API_KEY` → dùng heuristic offline; UI đánh dấu “chế độ dự phòng”.
- **Tuân thủ phân quyền:** RAG chỉ dùng dữ liệu trong phạm vi chương trình người dùng được phép.

## 4 mức tích hợp AI
1. **Văn bản** — tóm tắt, mô tả minh chứng, soạn nháp.
2. **Rà soát logic** — khoảng trống ma trận PLO, thiếu minh chứng/số liệu trong SAR.
3. **Khuyến nghị** — hành động cải tiến (PDCA), tiêu chí phù hợp cho minh chứng.
4. **Trợ lý quản trị** — hỏi đáp RAG, nhận định nhanh cho lãnh đạo, cảnh báo rủi ro.

## Tính năng (features.ts)
| Hàm | Đầu vào | Đầu ra | Fallback |
|-----|---------|--------|----------|
| `summarizeText` | text minh chứng | tóm tắt 3–5 câu | trích câu đầu |
| `suggestCriteria` | text + danh mục tiêu chí | top tiêu chí + điểm | overlap từ khóa |
| `draftReportSection` | tiêu chí + tóm tắt minh chứng | bản nháp SAR (5 phần) | khung mẫu |
| `reviewReportSection` | nội dung SAR + #minh chứng | checklist vấn đề | quy tắc thiếu sót |
| `analyzeSurvey` | phản hồi mở + điểm Likert | tóm tắt + nhóm chủ đề + gợi ý | tần suất từ khóa |
| `suggestImprovements` | vấn đề/tồn tại | kế hoạch PDCA | khung PDCA |
| `ragRetrieve`/`ragAnswer` | câu hỏi + programId | trả lời + citations | top đoạn liên quan |

## RAG pipeline
Upload → trích xuất text (PDF/DOCX/XLSX) → `chunkText` → `embedText` (`Float[]`, dim 256) lưu `DocumentChunk`.
Hỏi đáp: embed câu hỏi → cosine với chunks của chương trình → top-k → dựng ngữ cảnh → Claude trả lời kèm
trích dẫn minh chứng `[n]`.

## Cấu hình
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (mặc định `claude-opus-4-8`). Production: đặt key trong Secret Manager;
cân nhắc Claude trên Vertex AI; nâng embeddings lên provider thật + pgvector/Vertex Vector Search.
