# 08 — Báo cáo & Đơn vị đầu mối

Phần mềm sinh báo cáo từ dữ liệu các phân hệ; AI hỗ trợ tổng hợp/soạn nháp, **đơn vị đầu mối kiểm tra**
và cấp có thẩm quyền phê duyệt.

## Nhóm báo cáo (theo một đợt kiểm định)
| Nhóm | Báo cáo tiêu biểu | Nguồn dữ liệu | AI | Đơn vị đầu mối |
|------|-------------------|---------------|----|----------------|
| Quản trị tiến độ | Tổng quan tiến độ, theo đơn vị, bản đồ rủi ro | tasks, evidence, metrics | nhận định/auto-brief | Phòng KT&ĐBCL |
| Dữ liệu & minh chứng | Danh mục minh chứng, tình trạng, chất lượng | evidence, links | tóm tắt, phát hiện trùng/yếu | Phòng KT&ĐBCL |
| Học thuật | Mục tiêu & PLO, ma trận PLO–HP, CLO–PLO, OBE | plo/clo/map, outcome | rà soát logic, khoảng trống | Khoa/Bộ môn |
| Vận hành đào tạo | Tuyển sinh, đội ngũ, CSVC, hỗ trợ người học | evidence theo nhóm | tổng hợp số liệu | Phòng ĐT/TCNS/TV/CTSV |
| Khảo sát | SV, CSV, GV, NTD | surveys | phân tích phản hồi | Phòng KT&ĐBCL |
| Tự đánh giá & ĐG ngoài | SAR theo tiêu chuẩn, tổng hợp, kiểm tra logic | reportSections | soạn nháp, rà soát SAR | Hội đồng TĐG |
| Cải tiến sau kiểm định | Khuyến nghị, kế hoạch cải tiến (PDCA) | improvements, recommendations | đề xuất hành động | Khoa + Phòng KT&ĐBCL |

## Quy trình kiểm tra & phê duyệt
1. Hệ thống tạo bản nháp/tổng hợp (có AI hỗ trợ, đánh dấu rõ).
2. Đơn vị đầu mối rà soát nội dung & minh chứng.
3. Hội đồng/tổ chuyên trách phản biện.
4. Cấp có thẩm quyền phê duyệt; lưu phiên bản, người tạo/kiểm tra/duyệt và `AuditLog`.

> AI **không** tự phê duyệt báo cáo. Mọi báo cáo chính thức cần xác nhận của người có thẩm quyền.

## Hiện trạng MVP
Đã có: dashboard tiến độ/rủi ro, danh mục & tình trạng minh chứng, ma trận PLO–HP, OBE, SAR (soạn/rà soát/
phê duyệt), khảo sát, PDCA. Xuất Word/PDF và báo cáo tổng hợp cấp trường: giai đoạn sau.
