<!--
=========================== CÁCH DÙNG (xoá khối này khi áp dụng) ===========================
File này là MẪU `CLAUDE.md` tái sử dụng cho MỌI app mới build bằng Claude Code.
Cách dùng:
  1) Copy file này vào thư mục gốc repo mới, đổi tên thành  CLAUDE.md
  2) Điền các chỗ {{...}} và xoá stack profile không dùng (§3)
  3) Claude Code sẽ tự đọc CLAUDE.md làm "trí nhớ dự án" mỗi phiên
Đúc kết từ: AIQMS3 (Next.js), AISRM1 (Python) và quy trình
  Claude Code → GitHub → Google Cloud Shell.
Mục tiêu: Claude build NHẤT QUÁN, deploy-ready ngay từ đầu, KHÔNG quyết lại từ đầu mỗi lần.
============================================================================================
-->

# {{APP_NAME}} — Hướng dẫn cho Claude Code

> {{Một câu mô tả: app làm gì, cho ai, theo chuẩn/khung nào}}
> **Nguyên tắc cốt lõi: AI chỉ gợi ý — con người kiểm tra & phê duyệt (human-in-the-loop).**

## 0. Bối cảnh dự án (điền khi khởi tạo)
| | |
|---|---|
| **Tên / mã app** | {{APP_NAME}} |
| **Lĩnh vực** | {{DOMAIN}} |
| **Người dùng & vai trò** | {{ROLES}} |
| **Chuẩn/khung tham chiếu** | {{STANDARD, ví dụ AUN-QA / Bộ GD&ĐT}} |
| **GitHub** | {{github.com/owner/repo}} |
| **GCP project / Region** | {{project-id}} / {{asia-southeast1}} |

## 1. Nguyên tắc bất di bất dịch (KHÔNG vi phạm)
1. **Human-in-the-loop** — AI chỉ tạo `DRAFT`/`SUGGESTION`; cần người duyệt mới có hiệu lực.
2. **RBAC + entity scope** enforce ở **backend** *và* ở **AI retrieval**; bắt buộc có **permission tests**.
3. **Không bịa** — output AI fact-based phải kèm **citations** (trỏ về nguồn/minh chứng thật).
4. **Không lưu file gốc trong DB** — object storage + metadata (mô hình 3 lớp, §2).
5. **Không commit secret/PII** — secrets qua Secret Manager / env; migration qua {{Alembic | Prisma}}.
6. **Modular monolith** sạch, một artifact deploy, mở rộng dần (không tách microservice sớm).

## 2. Kiến trúc chuẩn
- **Modular monolith**: một codebase, một image deploy — dễ bảo trì.
- **Lưu trữ 3 lớp** (theo yêu cầu kiểm định/đối soát):
  1. *File gốc* → object storage (local khi dev | Google Cloud Storage khi prod)
  2. *Metadata* → PostgreSQL
  3. *Text trích xuất + chunks + embeddings* → PostgreSQL (cho AI/RAG)
- **AI provider**: Anthropic Claude (`claude-opus-4-8` mặc định) + **fallback cục bộ** deterministic chạy được khi CHƯA có API key (đánh dấu rõ trạng thái fallback).
- **Đích triển khai = Google Cloud Run** (container stateless, lắng nghe `$PORT`). Viết code deploy-ready ngay từ đầu — xem §8.

## 3. Stack mặc định (CHỌN 1 — đừng quyết lại giữa chừng)
**Profile A — TypeScript (như AIQMS3):**
Next.js 16 (App Router, RSC + Server Actions) · TypeScript · Prisma 7 + PostgreSQL · Tailwind v4 · lucide-react · recharts · `@anthropic-ai/sdk` · unpdf / mammoth / xlsx · `@google-cloud/storage`.

**Profile B — Python (như AISRM1):**
FastAPI · SQLAlchemy + Alembic · PostgreSQL · pydantic · pytest · uvicorn · `anthropic` · `google-cloud-storage`.

*Chung*: PostgreSQL (pgvector-ready), RAG bằng embeddings, Docker → Cloud Run.

## 4. Tài liệu trước, code sau (thư mục `docs/`)
Dựng tài liệu nền **trước khi code** để bám phạm vi, giảm làm lại. Taxonomy chuẩn:
```
01_PRD              02_MVP_SCOPE        03_USER_ROLES_PERMISSIONS  04_DATABASE_SCHEMA
05_API_ACTIONS      06_AI_FEATURES      07_UI_SCREENS              08_REPORTS
09_DEPLOYMENT_GUIDE 10_ROADMAP          11_USER_GUIDE
```
Kèm `CLAUDE.md` (file này) + `README.md` (bắt đầu nhanh) + `docs/README.md` (mục lục).

## 5. Build theo Epic (commit mỗi epic)
```
E1  Foundation        cấu trúc repo, config, CLAUDE.md, bộ docs, CI
E2  Auth & RBAC       11+ vai trò, capability, entity scope (+ permission tests)
E3+ Domain entities   các phân hệ nghiệp vụ cốt lõi
E9  Documents         upload abstraction, version, classification, extraction, search
E10/E11 AI + RAG      providers, prompt registry, ai_jobs/outputs/citations, embeddings
E12 Workflow & Reports  tasks/notifications, dashboards, report catalog, export
    Frontend          API client, auth, layout theo vai trò, màn hình trọng tâm
    Hoàn thiện        migration/seed, tests, README, commit + push
```
Mỗi epic: **code → test → tự kiểm theo §1 → commit** (message rõ ràng, súc tích).

## 6. Quy ước AI / RAG / bảo mật
- Mọi tác vụ AI **ghi vết**: `ai_job` (input, model, prompt version, cost ước tính) + `ai_output` (kèm citations).
- RAG retrieval **phải lọc theo quyền + entity scope** của người dùng — không rò dữ liệu ngoài phạm vi.
- **Prompt registry** versioned, tập trung — không rải prompt khắp code.
- Đánh dấu rõ khi đang dùng **fallback** (chưa cấu hình API key).
- `.env` KHÔNG commit; luôn có `.env.example`. Secrets chỉ qua env / Secret Manager.

## 7. Quy trình giao hàng (đã chứng minh)
```
Claude Code (build · test · commit)  →  GitHub (nguồn sự thật)  →  Cloud Shell (deploy)
```
Deploy qua **Google Cloud Shell** (`gcloud` đã auth sẵn, có docker/git). **Commit sẵn `deploy/cloudshell_deploy.sh`** để mỗi lần deploy chỉ chạy 1 lệnh đã review:
```bash
git clone {{REPO_URL}} && cd {{REPO}} && ./deploy/cloudshell_deploy.sh
```
**Bộ dịch vụ GCP**: Cloud Run · Cloud SQL (Postgres) · Cloud Storage · Artifact Registry · Cloud Build · Secret Manager · IAM/Service Account. Runbook đầy đủ ở `docs/09_DEPLOYMENT_GUIDE.md`.

## 8. Pre-flight Cloud Run (checklist tránh lỗi deploy hay gặp)
- [ ] App **bind `0.0.0.0:$PORT`** (Cloud Run cấp `$PORT`=8080); không hardcode cổng.
- [ ] **Stateless**: không dùng đĩa cục bộ làm kho lưu — file đi GCS.
- [ ] *(TS/Prisma)* đặt **`DATABASE_URL` dummy TRƯỚC `prisma generate`/build** trong Docker builder; URL thật cấp ở runtime.
- [ ] Migration là **bước riêng** khi deploy: `{{alembic upgrade head | prisma migrate deploy}}` (chạy 1 lần, có quyền Cloud SQL — qua cloud-sql-proxy hoặc Cloud Run Job).
- [ ] Cloud Run tự dùng **ADC** — không tải key JSON, không cần `GOOGLE_APPLICATION_CREDENTIALS`.
- [ ] Ký **V4 signed URL** cho tải file: SA cần `roles/iam.serviceAccountTokenCreator` lên **chính nó**.
- [ ] Cloud SQL nối qua socket `/cloudsql/PROJECT:REGION:INSTANCE` + `--add-cloudsql-instances`.
- [ ] Secrets nạp qua `--set-secrets` (Secret Manager); env thường qua `--set-env-vars`.
- [ ] SA **tối thiểu quyền**: `storage.objectAdmin` (bucket) · `cloudsql.client` · `secretmanager.secretAccessor`.

## 9. Definition of Done
- [ ] Đủ chức năng MVP theo `02_MVP_SCOPE.md`; tuân thủ toàn bộ §1.
- [ ] Có **permission tests** (RBAC + scope); pipeline xanh (typecheck/build hoặc pytest).
- [ ] Migration + seed demo chạy sạch trên **bản clone mới**.
- [ ] `README.md` + `09_DEPLOYMENT_GUIDE.md` + `deploy/cloudshell_deploy.sh` đầy đủ.
- [ ] Không secret/PII trong repo. Commit + push lên nhánh đã chỉ định.

## 10. Làm việc hiệu quả với Claude Code
- **Nền trước**: dựng cấu trúc + docs + CLAUDE.md ngay ở E1 để mọi epic sau bám vào.
- **Khai báo đích deploy từ đầu** (Cloud Run + bộ dịch vụ §7) → code deploy-ready, khỏi sửa lại.
- Dùng **plan mode** cho việc lớn; chốt phạm vi trước khi viết code.
- **Commit theo epic**, chạy test/typecheck trước mỗi commit.
- **Cập nhật CLAUDE.md** khi có quyết định kiến trúc mới — để phiên sau không hỏi lại.
- Quyết định thuộc về người dùng (chuẩn nghiệp vụ, ưu tiên phạm vi) → **hỏi gọn**, đừng đoán.
