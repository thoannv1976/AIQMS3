# 03 — Vai trò & Phân quyền (RBAC)

Phân quyền theo mô hình **capability-based**: mỗi vai trò ánh xạ tới tập năng lực (capability).
`ADMIN` mặc định có mọi năng lực. Nguồn: `src/lib/rbac.ts`.

## Vai trò
| Mã | Vai trò |
|----|---------|
| ADMIN | Quản trị hệ thống |
| BOARD | Ban Giám hiệu |
| QA_OFFICE | Phòng Khảo thí & ĐBCL |
| TRAINING_OFFICE | Phòng Đào tạo |
| FACULTY | Khoa / Viện |
| DEPARTMENT | Bộ môn |
| LECTURER | Giảng viên |
| HR_OFFICE | Phòng Tổ chức nhân sự |
| LIBRARY | Thư viện |
| IT_CENTER | Trung tâm CNTT |
| STUDENT_AFFAIRS | Phòng Công tác sinh viên |

## Năng lực (capability)
`dashboard:view`, `program:view|write`, `standard:view|write`, `outcome:view|write`,
`syllabus:view|write`, `evidence:view|write|approve`, `task:view|write`,
`report:view|write|approve`, `survey:view|write`, `obe:view|write`,
`improvement:view|write`, `ai:use`, `audit:view`, `admin:users`.

## Ma trận quyền (rút gọn)
| Vai trò | Xem | program:write | evidence:write | evidence:approve | report:write | report:approve | audit:view | admin:users |
|---|---|---|---|---|---|---|---|---|
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| QA_OFFICE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| FACULTY | ✅ | ✅ | ✅ | ✅ | ✅ | | | |
| DEPARTMENT | ✅ | | ✅ | | | | | |
| LECTURER | ✅ | | ✅ | | | | | |
| TRAINING_OFFICE | ✅ | ✅ | ✅ | | | | | |
| BOARD | ✅ | | | | | ✅ | ✅ | |
| HR/LIBRARY/IT/CTSV | ✅ | | ✅ | | | | | |

> Mọi vai trò đều có `ai:use`. Điều hướng (sidebar) được lọc theo năng lực; trang & server action
> kiểm tra quyền phía máy chủ (`can(role, capability)`), không chỉ ẩn UI.

## AI tuân thủ phân quyền
Trợ lý AI/RAG chỉ truy vấn dữ liệu trong phạm vi chương trình người dùng được phép xem; không dùng nội
dung minh chứng ngoài quyền hạn để trả lời.
