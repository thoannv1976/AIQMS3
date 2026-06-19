# 02 — MVP Scope

## Trong phạm vi MVP (đã triển khai)
1. **Xác thực & RBAC** — đăng nhập JWT, 11 vai trò, phân quyền theo năng lực.
2. **Quản lý CTĐT** — CRUD chương trình, phiên bản, học phần, PLO, chu kỳ kiểm định.
3. **Bộ tiêu chuẩn & tiêu chí** — AUN-QA v4 (8 tiêu chuẩn, 15 tiêu chí), theo dõi minh chứng/tiêu chí.
4. **Chuẩn đầu ra & ma trận** — PLO/CLO, ma trận học phần→PLO (I/R/M) + **AI rà soát khoảng trống**.
5. **Đề cương học phần** — đề cương, CLO, đóng góp PLO.
6. **Minh chứng** — upload, trích xuất văn bản, gắn tiêu chí, vòng đời/duyệt + **AI tóm tắt & gợi ý tiêu chí**.
7. **Nhiệm vụ & tiến độ** — Kanban, phân công đơn vị/tiêu chí.
8. **Báo cáo tự đánh giá** — soạn theo tiêu chuẩn, phê duyệt + **AI soạn nháp & rà soát SAR**.
9. **Khảo sát** — Likert + phản hồi mở + **AI phân tích phản hồi**.
10. **OBE** — tỷ lệ đạt PLO, cảnh báo dưới ngưỡng.
11. **Cải tiến (PDCA)** — kế hoạch cải tiến + **AI đề xuất hành động**.
12. **Trợ lý AI (RAG)** — hỏi đáp trên kho minh chứng, có trích dẫn.
13. **Dashboard** — sẵn sàng kiểm định, bản đồ rủi ro, nhận định nhanh.
14. **Audit log & quản trị người dùng**.

## Ngoài phạm vi MVP (giai đoạn sau)
- AI Evidence Strength Score & Accreditation Readiness Score nâng cao.
- AI kiểm tra logic chi tiết PLO–CLO–Assessment–Rubric, rà soát đề cương tự động.
- Module giải trình đánh giá ngoài, quản lý cuộc họp/biên bản, phỏng vấn đánh giá ngoài.
- So sánh/benchmark nhiều chương trình cấp trường; tích hợp LMS/Moodle/cổng đào tạo.
- pgvector / Vertex AI Vector Search ở quy mô lớn; SSO/Identity Platform; thông báo realtime.

## Tiêu chí hoàn thành MVP
- Đăng nhập + phân quyền hoạt động; có thể demo trọn vẹn 1 chương trình kiểm định.
- Upload minh chứng → AI tóm tắt/gợi ý tiêu chí → đưa vào SAR → theo dõi tiến độ → cải tiến.
- Build & deploy được lên Cloud Run; có audit log.
