# 10 — Roadmap theo giai đoạn

Theo định hướng 6 giai đoạn (0–5); khi trình bày lãnh đạo có thể gộp thành 3 giai đoạn chiến lược.

## Giai đoạn 0 — Chuẩn hóa yêu cầu ✅
Bộ tài liệu `docs/` (PRD, MVP scope, roles, DB schema, API, AI, UI, reports, deployment).

## Giai đoạn 1 — Nền tảng lõi ✅
Đăng nhập, RBAC, đơn vị, chương trình ĐT, chu kỳ kiểm định, dashboard, audit log.

## Giai đoạn 2 — Tiêu chuẩn, nhiệm vụ & minh chứng ✅
Bộ tiêu chuẩn AUN-QA, tiêu chí, nhiệm vụ Kanban, upload & quản lý minh chứng, gắn tiêu chí, duyệt, vòng đời.

## Giai đoạn 3 — Báo cáo & AI cơ bản ✅ (mốc MVP)
Báo cáo tiến độ/danh mục minh chứng; SAR; AI tóm tắt, gợi ý tiêu chí, soạn/rà soát SAR, chatbot RAG.

## Giai đoạn 4 — AI nâng cao & quản trị chất lượng ✅
- ✅ **AI Gap Analysis theo từng tiêu chí** (trang `/readiness`).
- ✅ **Accreditation Readiness Score** + **Evidence Strength Score** (engine `lib/quality/scoring.ts`, xếp hạng AUN-QA 7 mức).
- ✅ **Kiểm tra logic PLO–CLO–Assessment–Rubric** (trang `/curriculum-check`, engine `lib/quality/curriculum.ts`).
- ✅ **Rà soát đề cương tự động** (trang `/syllabi/[courseId]`, engine `lib/quality/syllabus.ts`): chấm mức đầy đủ + constructive alignment + AI nhận định.
- ✅ **AI Review SAR nâng cao** (trong trình soạn SAR): chấm điểm chất lượng theo rubric (`lib/quality/sar.ts`) + đối chiếu độ mạnh minh chứng + AI gợi ý viết lại.
- ✅ **Phân tích xu hướng qua nhiều chu kỳ** (trang `/obe`, engine `lib/quality/trends.ts`): biểu đồ đường tỷ lệ đạt TB theo kỳ + ma trận PLO×kỳ + hướng tăng/giảm.
- ✅ **Khảo sát nâng cao** (trang `/surveys`, engine `lib/quality/surveys.ts`): so sánh hài lòng giữa các bên + xu hướng đa năm + AI phân tích phản hồi mở.
- ✅ **PDCA nâng cao** (minh chứng trước/sau cải tiến tại `/improvements`) + **module giải trình đánh giá ngoài** (`/external-review`: ghi nhận khuyến nghị, AI soạn giải trình, theo dõi khắc phục).

## Giai đoạn 5 — Pilot, Cloud Run & mở rộng (đang triển khai)
- 🟡 Pilot 1 chương trình dữ liệu thật; deploy **Cloud Run + Cloud SQL + Secret Manager** *(Dockerfile/seed đã vá để build deploy sạch — đang chạy thử)*.
- ✅ **Lưu trữ minh chứng trên Cloud Storage** (driver GCS `lib/storage.ts`: upload `gs://`, **V4 signed URL**, tải tệp `/evidence/[id]/file`, xử lý lại).
- ✅ **Xuất báo cáo Word/PDF** (SAR) + **danh mục minh chứng Excel**.
- ✅ **Benchmark nhiều chương trình** (`/benchmark`: đối sánh readiness/AUN/OBE/độ mạnh MC).
- ⬜ Tích hợp LMS/Moodle/cổng đào tạo; SSO/Identity Platform.
- ✅ **Nâng RAG bằng pgvector** (`lib/ai/vector.ts`: tìm kiếm vector trong Postgres, chỉ mục HNSW cosine, fallback cosine trong app; bật bằng `RAG_DRIVER=pgvector` + `npm run rag:pgvector`).
- 🟡 Embeddings provider thật (Vertex AI / Voyage) thay `embedText` heuristic — còn lại.

## Gộp 3 giai đoạn chiến lược
1. **Xây dựng MVP** (GĐ 0–3) — đã hoàn thành.
2. **Nâng cấp AI thông minh** (GĐ 4) — đã hoàn thành.
3. **Triển khai & nhân rộng** (GĐ 5) — kế tiếp.
