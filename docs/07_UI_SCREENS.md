# 07 — UI Screens

Bố cục: **Sidebar** (điều hướng lọc theo quyền) + **Topbar** (đơn vị, trạng thái AI, người dùng, đăng xuất)
+ vùng nội dung. Tiếng Việt, tối giản, chuyên nghiệp (Tailwind v4).

| Route | Màn hình | Ghi chú |
|-------|----------|---------|
| `/login` | Đăng nhập | tài khoản demo, panel thương hiệu |
| `/dashboard` | Bảng điều khiển | stat cards, độ sẵn sàng theo CTĐT, biểu đồ minh chứng, bản đồ rủi ro, auto-brief, hoạt động gần đây |
| `/programs` · `/programs/new` · `/programs/[id]` | Chương trình | danh sách + độ sẵn sàng; tạo; chi tiết (phiên bản, học phần, PLO, chu kỳ) |
| `/outcomes` | Chuẩn đầu ra & ma trận | PLO, ma trận học phần→PLO (I/R/M), **AI rà soát khoảng trống** |
| `/syllabi` · `/syllabi/[courseId]` | Đề cương học phần | danh sách; chi tiết (đề cương, CLO, đóng góp PLO) |
| `/standards` · `/standards/[id]` | Bộ tiêu chuẩn | danh sách; cây tiêu chuẩn/tiêu chí + số minh chứng |
| `/evidence` · `/evidence/new` · `/evidence/[id]` | Minh chứng | danh sách; upload; chi tiết + **AI tóm tắt/gợi ý tiêu chí** + duyệt |
| `/tasks` · `/tasks/new` | Nhiệm vụ | bảng Kanban, đổi trạng thái; tạo việc |
| `/reports` · `/reports/[id]` | Báo cáo TĐG | danh sách + tiến độ; chi tiết theo mục + **AI nháp/rà soát** + phê duyệt |
| `/improvements` · `/improvements/new` | Cải tiến PDCA | danh sách + đổi trạng thái PDCA; tạo + **AI gợi ý** |
| `/surveys` · `/surveys/[id]` | Khảo sát | danh sách; chi tiết (Likert + phản hồi mở) + **AI phân tích** |
| `/obe` | OBE | biểu đồ tỷ lệ đạt PLO + bảng + cảnh báo dưới ngưỡng |
| `/ai-assistant` | Trợ lý AI | chatbot RAG, câu hỏi mẫu, trích dẫn minh chứng |
| `/audit` | Nhật ký | bảng audit log |
| `/admin/users` | Quản trị người dùng | danh sách + tạo + khóa/mở |

**Thành phần dùng chung:** `ProgramSwitcher` (chọn chương trình qua `?program=`), `StatCard`, `Progress`,
`Badge`, `Card`, biểu đồ (`BarChartCard`, `PieChartCard`).
