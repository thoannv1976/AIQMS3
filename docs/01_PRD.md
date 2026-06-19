# 01 — PRD (Product Requirements Document)

## 1. Bối cảnh & mục tiêu
AIQMS3 là phần mềm quản lý đảm bảo chất lượng (ĐBCL) và kiểm định chương trình đào tạo (CTĐT) cho cơ sở
giáo dục đại học, tích hợp AI để tự động hóa các tác vụ lặp lại, rà soát logic học thuật, phát hiện rủi ro
sớm và hỗ trợ ra quyết định dựa trên dữ liệu.

**Mục tiêu:**
1. Nền tảng quản lý tập trung dữ liệu CTĐT (chuẩn đầu ra, học phần, minh chứng, báo cáo, khảo sát…).
2. Hỗ trợ quy trình ĐBCL có hệ thống: thiết kế → triển khai → thu thập dữ liệu → đánh giá → cải tiến.
3. Hỗ trợ kiểm định: quản lý tiêu chuẩn/tiêu chí, minh chứng, báo cáo tự đánh giá, kế hoạch hành động.
4. Ứng dụng AI nâng cao hiệu quả xử lý, tăng tính nhất quán hồ sơ, giảm tải thủ công.

## 2. Phạm vi
Theo chuẩn **Bộ GD&ĐT / AUN-QA**. MVP triển khai 10 module lõi (xem `02_MVP_SCOPE.md`).

## 3. Đối tượng sử dụng
Ban Giám hiệu · Phòng Khảo thí & ĐBCL · Phòng Đào tạo · Khoa/Viện · Bộ môn · Giảng viên ·
Phòng TCNS · Thư viện · Trung tâm CNTT · Phòng CTSV (chi tiết `03_USER_ROLES_PERMISSIONS.md`).

## 4. Phân hệ chức năng
1. Quản lý CTĐT (có quản lý phiên bản)
2. Chuẩn đầu ra & ma trận liên kết (PLO/CLO, học phần→PLO)
3. Đề cương học phần
4. Quản lý minh chứng kiểm định (3 lớp lưu trữ)
5. Báo cáo tự đánh giá (SAR)
6. Khảo sát & phản hồi các bên liên quan
7. Đánh giá mức độ đạt chuẩn đầu ra (OBE)
8. Kế hoạch cải tiến (PDCA)
9. Nhiệm vụ & tiến độ kiểm định (Kanban)
10. Trợ lý AI (RAG), Dashboard, Audit log, Quản trị người dùng

## 5. Yêu cầu phi chức năng
- **Bảo mật & phân quyền:** RBAC theo vai trò + năng lực; mức bảo mật minh chứng; audit log đầy đủ.
- **AI có kiểm soát:** human-in-the-loop, ghi vết prompt/kết quả, tuân thủ phân quyền dữ liệu.
- **Khả năng mở rộng:** kiến trúc serverless (Cloud Run), tách lớp AI/tài liệu để mở rộng dần.
- **Sao lưu & khôi phục:** Cloud SQL backup + PITR; file ở object storage với versioning.

## 6. Nguyên tắc AI
AI không thay thế chuyên môn con người; chỉ phân tích, gợi ý, cảnh báo. Mọi kết quả AI ở trạng thái
“gợi ý”, phải được người có thẩm quyền kiểm tra & phê duyệt. Hệ thống đánh dấu khi AI dùng chế độ dự phòng.
