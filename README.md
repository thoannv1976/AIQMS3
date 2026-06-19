# AIQMS3 — Hệ thống Quản lý ĐBCL & Kiểm định Chương trình Đào tạo tích hợp AI

**AIQMS3** (*AI-integrated Quality Assurance & Program Accreditation Management System*) số hóa toàn bộ
quy trình đảm bảo chất lượng (ĐBCL) và kiểm định chương trình đào tạo (CTĐT) cho cơ sở giáo dục đại học
theo chuẩn **Bộ GD&ĐT / AUN-QA**, với **AI hỗ trợ** xuyên suốt: tóm tắt minh chứng, gợi ý tiêu chí,
rà soát ma trận chuẩn đầu ra, soạn & rà soát báo cáo tự đánh giá, phân tích khảo sát, đề xuất cải tiến
và hỏi đáp (RAG) trên kho minh chứng nội bộ.

> Nguyên tắc cốt lõi: **AI chỉ gợi ý — con người kiểm tra và phê duyệt** (human-in-the-loop).
> Mọi đề xuất AI đều được ghi vết và đánh dấu rõ khi dùng chế độ dự phòng (chưa cấu hình Claude API).

---

## ✨ Tính năng chính (MVP)

| # | Module | Mô tả | AI |
|---|--------|-------|----|
| 1 | Xác thực & phân quyền (RBAC) | 11 vai trò, phân quyền theo năng lực (capability) | |
| 2 | Quản lý chương trình đào tạo | Thông tin, phiên bản, học phần, PLO, chu kỳ kiểm định | |
| 3 | Bộ tiêu chuẩn & tiêu chí | AUN-QA v4 (8 tiêu chuẩn), theo dõi minh chứng theo tiêu chí | |
| 4 | Chuẩn đầu ra & ma trận | PLO/CLO, ma trận học phần→PLO (I/R/M) | ✅ Rà soát khoảng trống |
| 5 | Đề cương học phần | Đề cương, CLO, đóng góp PLO | |
| 6 | Minh chứng | Upload, trích xuất văn bản, phân loại, duyệt, vòng đời | ✅ Tóm tắt, gợi ý tiêu chí |
| 7 | Nhiệm vụ & tiến độ | Bảng Kanban, phân công theo đơn vị/tiêu chí | |
| 8 | Báo cáo tự đánh giá (SAR) | Soạn theo tiêu chuẩn, phê duyệt | ✅ Soạn nháp, rà soát |
| 9 | Khảo sát các bên | SV/CSV/GV/NTD, thống kê Likert + phản hồi mở | ✅ Phân tích phản hồi |
| 10 | OBE — đạt chuẩn đầu ra | Tỷ lệ đạt PLO/CLO, cảnh báo dưới ngưỡng | |
| 11 | Cải tiến (PDCA) | Plan→Do→Check→Act, gắn minh chứng | ✅ Đề xuất hành động |
| 12 | Trợ lý AI | Chatbot hỏi đáp RAG trên kho minh chứng, có trích dẫn | ✅ RAG |
| 13 | Dashboard | Sẵn sàng kiểm định, bản đồ rủi ro, auto-brief lãnh đạo | ✅ Nhận định |
| 14 | Nhật ký & quản trị | Audit log, quản lý người dùng | |

## 🏗️ Kiến trúc & công nghệ

```
Next.js (App Router, RSC + Server Actions)
   ├── PostgreSQL + Prisma 7 (driver adapter)         → dữ liệu nghiệp vụ + metadata + embeddings
   ├── Object Storage (local | Google Cloud Storage)   → file minh chứng gốc
   └── Claude API (Anthropic) + fallback cục bộ         → tóm tắt, gợi ý, RAG, SAR
Deploy: GitHub → Docker → Google Cloud Run + Cloud SQL + Cloud Storage + Secret Manager
```

- **Frontend/Backend:** Next.js 16 + TypeScript (một codebase, một artifact deploy — dễ bảo trì)
- **CSDL:** PostgreSQL (pgvector-ready); embeddings lưu `Float[]`, RAG bằng cosine (MVP)
- **AI:** `@anthropic-ai/sdk` (model mặc định `claude-opus-4-8`), có **fallback** hoạt động offline
- **Xử lý tài liệu:** PDF (`unpdf`), DOCX (`mammoth`), XLSX (`xlsx`)
- **Styling:** Tailwind CSS v4 · **Icons:** lucide-react · **Charts:** recharts

Mô hình lưu trữ **3 lớp** theo yêu cầu kiểm định: *file gốc* (object storage) · *metadata* (PostgreSQL) ·
*text trích xuất + chunks + embeddings* (cho AI/RAG).

## 🚀 Bắt đầu nhanh (local)

```bash
# 1) Cài dependencies
npm install

# 2) Khởi động PostgreSQL (Docker)
docker compose up -d        # hoặc dùng PostgreSQL sẵn có

# 3) Cấu hình môi trường
cp .env.example .env        # chỉnh DATABASE_URL, AUTH_SECRET, (tùy chọn) ANTHROPIC_API_KEY

# 4) Tạo schema + dữ liệu demo
npm run db:migrate
npm run db:seed

# 5) Chạy
npm run dev                 # http://localhost:3000
```

**Tài khoản demo** (mật khẩu `Aiqms@123`):

| Vai trò | Email |
|---------|-------|
| Quản trị hệ thống | `admin@aiqms.edu.vn` |
| Phòng Khảo thí & ĐBCL | `qa@aiqms.edu.vn` |
| Khoa / Viện | `khoa@aiqms.edu.vn` |
| Giảng viên | `giangvien@aiqms.edu.vn` |
| Ban Giám hiệu | `bgh@aiqms.edu.vn` |

## 🤖 Cấu hình AI

- Để trống `ANTHROPIC_API_KEY` → hệ thống dùng **chế độ dự phòng** (heuristic, offline) cho mọi tính năng AI;
  giao diện hiển thị nhãn “chế độ dự phòng”.
- Đặt `ANTHROPIC_API_KEY` → dùng Claude thật. Đổi model qua `ANTHROPIC_MODEL` (mặc định `claude-opus-4-8`).
- Production nên đặt key trong **Secret Manager**, không commit vào repo.

## 📦 Scripts

| Lệnh | Tác dụng |
|------|----------|
| `npm run dev` | Chạy môi trường phát triển |
| `npm run build` | `prisma generate` + build production |
| `npm start` | Chạy bản production |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm run db:migrate` | Tạo & áp dụng migration |
| `npm run db:seed` | Nạp dữ liệu demo |
| `npm run db:reset` | Reset DB + seed lại |

## 🗂️ Cấu trúc dự án

```
prisma/            schema.prisma · migrations · seed.ts
src/
  app/
    login/                     # đăng nhập
    (app)/                     # khu vực đã xác thực (sidebar + topbar)
      dashboard/ programs/ outcomes/ syllabi/ standards/
      evidence/ tasks/ reports/ improvements/ surveys/ obe/
      ai-assistant/ audit/ admin/users/
  components/       ui.tsx · widgets · charts · sidebar · topbar · program-switcher
  lib/
    db.ts auth.ts rbac.ts audit.ts storage.ts metrics.ts labels.ts nav.ts
    ai/  client.ts embeddings.ts documents.ts features.ts
docs/              PRD, MVP scope, roles, DB schema, API, AI, UI, reports, deployment
Dockerfile · docker-compose.yml · .github/workflows/ci.yml
```

## ☁️ Triển khai

Xem [`docs/09_DEPLOYMENT_GUIDE.md`](docs/09_DEPLOYMENT_GUIDE.md) (Docker → Cloud Run + Cloud SQL + Cloud Storage).
Image dùng Next.js **standalone**; biến môi trường bắt buộc: `DATABASE_URL`, `AUTH_SECRET`
(và `ANTHROPIC_API_KEY`, `STORAGE_DRIVER=gcs`, `GCS_BUCKET` cho production).

## 📚 Tài liệu

Bộ tài liệu kỹ thuật trong [`docs/`](docs/): PRD · MVP Scope · Roles & Permissions · Database Schema ·
API/Server Actions · AI Features · UI Screens · Reports · Deployment Guide · Roadmap theo giai đoạn.

---

*AIQMS3 — chuyển từ “chuẩn bị hồ sơ để kiểm định” sang “quản trị chất lượng liên tục dựa trên dữ liệu và AI”.*
