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

## Giai đoạn 4 — AI nâng cao & quản trị chất lượng (đang triển khai)
- ✅ **AI Gap Analysis theo từng tiêu chí** (trang `/readiness`).
- ✅ **Accreditation Readiness Score** + **Evidence Strength Score** (engine `lib/quality/scoring.ts`, xếp hạng AUN-QA 7 mức).
- ✅ **Kiểm tra logic PLO–CLO–Assessment–Rubric** (trang `/curriculum-check`, engine `lib/quality/curriculum.ts`).
- ✅ **Rà soát đề cương tự động** (trang `/syllabi/[courseId]`, engine `lib/quality/syllabus.ts`): chấm mức đầy đủ + constructive alignment + AI nhận định.
- ✅ **AI Review SAR nâng cao** (trong trình soạn SAR): chấm điểm chất lượng theo rubric (`lib/quality/sar.ts`) + đối chiếu độ mạnh minh chứng + AI gợi ý viết lại.
- ✅ **Phân tích xu hướng qua nhiều chu kỳ** (trang `/obe`, engine `lib/quality/trends.ts`): biểu đồ đường tỷ lệ đạt TB theo kỳ + ma trận PLO×kỳ + hướng tăng/giảm.
- 🟡 Khảo sát nâng cao (đã có phân tích phản hồi AI) — cần xu hướng khảo sát đa kỳ & so sánh các bên.
- ⬜ Quản lý PDCA nâng cao (minh chứng trước/sau cải tiến); module giải trình đánh giá ngoài.

## Giai đoạn 5 — Pilot, Cloud Run & mở rộng
- Pilot 1 chương trình với dữ liệu thật; deploy Cloud Run + Cloud SQL + Cloud Storage + Secret Manager.
- Xuất báo cáo Word/PDF; benchmark nhiều chương trình; tích hợp LMS/Moodle/cổng đào tạo; SSO/Identity Platform.
- Nâng RAG: embeddings provider thật + **pgvector / Vertex AI Vector Search**.

## Gộp 3 giai đoạn chiến lược
1. **Xây dựng MVP** (GĐ 0–3) — đã hoàn thành.
2. **Nâng cấp AI thông minh** (GĐ 4).
3. **Triển khai & nhân rộng** (GĐ 5).
