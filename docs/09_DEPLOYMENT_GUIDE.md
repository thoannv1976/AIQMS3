# 09 — Deployment Guide (Google Cloud Run)

## Kiến trúc triển khai
```
GitHub → Cloud Build / GitHub Actions → Docker image → Artifact Registry → Cloud Run
Cloud Run ──┬── Cloud SQL (PostgreSQL)        DATABASE_URL
            ├── Cloud Storage (minh chứng)    STORAGE_DRIVER=gcs, GCS_BUCKET
            ├── Secret Manager                AUTH_SECRET, ANTHROPIC_API_KEY, DB password
            └── Claude API / Vertex AI         ANTHROPIC_API_KEY
```

## Biến môi trường (production)
| Biến | Bắt buộc | Ghi chú |
|------|----------|---------|
| `DATABASE_URL` | ✅ | Cloud SQL (dùng socket `/cloudsql/...` hoặc connector) |
| `AUTH_SECRET` | ✅ | chuỗi ngẫu nhiên mạnh (`openssl rand -base64 48`) |
| `ANTHROPIC_API_KEY` | — | bật AI thật; để trống = chế độ dự phòng |
| `ANTHROPIC_MODEL` | — | mặc định `claude-opus-4-8` |
| `STORAGE_DRIVER` | — | `local` (mặc định) hoặc `gcs` |
| `GCS_BUCKET`, `GCS_PROJECT_ID` | khi gcs | bucket lưu minh chứng |

## Build & chạy bằng Docker
```bash
docker build -t aiqms3 .
docker run -p 8080:8080 -e DATABASE_URL=... -e AUTH_SECRET=... aiqms3
```
Image dùng Next.js **standalone** (`output: "standalone"`), chạy `node server.js` cổng 8080.
`Dockerfile` đã build sạch từ bản clone mới — **không cần vá thủ công**.

### Ghi chú build (Prisma 7 + standalone)
- `prisma generate` đọc `prisma.config.ts` → `env("DATABASE_URL")`, nên **biến `DATABASE_URL`
  (dummy) phải được đặt TRƯỚC `prisma generate`** trong builder stage. Build không kết nối DB
  thật; URL thật được cấp ở runtime qua Cloud Run env/Secret Manager.
- Generator `prisma-client` xuất client vào **`src/generated/prisma`** (không phải
  `node_modules/.prisma`). Runner chỉ cần copy `prisma/` + `src/generated/` — **không** copy
  `node_modules/.prisma` (thư mục này không tồn tại với driver adapter, copy sẽ gây lỗi build).

## Triển khai Cloud Run (tóm tắt)
```bash
# 1) Build & push
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/aiqms/app

# 2) Migrate DB (chạy 1 lần, có quyền Cloud SQL)
#    DATABASE_URL=... npx prisma migrate deploy

# 3) Deploy
gcloud run deploy aiqms3 \
  --image REGION-docker.pkg.dev/PROJECT/aiqms/app \
  --add-cloudsql-instances PROJECT:REGION:INSTANCE \
  --set-secrets AUTH_SECRET=aiqms-auth:latest,ANTHROPIC_API_KEY=claude-key:latest \
  --set-env-vars STORAGE_DRIVER=gcs,GCS_BUCKET=aiqms-evidence \
  --region REGION --allow-unauthenticated
```

## Migrate & seed
- `npx prisma migrate deploy` (production), `npm run db:seed` (chỉ môi trường demo/pilot).
- `npm run db:seed` đã tự chạy `prisma generate` trước khi seed, nên không gặp lỗi
  `Cannot find module 'src/generated/prisma/client'` trên bản clone mới.

## Lưu trữ & xử lý minh chứng (Cloud Storage)
`src/lib/storage.ts` đã hiện thực driver **GCS** (`@google-cloud/storage`). Bật bằng env:
```
STORAGE_DRIVER=gcs
GCS_BUCKET=aiqms-evidence
GCS_PROJECT_ID=your-project
```
- **Upload**: tệp minh chứng lưu vào `gs://<bucket>/evidence/{program}/{year}/{criterion}/{file}`; CSDL chỉ giữ metadata + `storagePath`.
- **Tải tệp**: route `/evidence/[id]/file` → với GCS trả về **V4 signed URL** (15 phút), tệp tải thẳng từ Cloud Storage (không proxy qua app) → chịu tải tốt với khối lượng lớn.
- **Xử lý lại**: nút "Xử lý lại" trên trang minh chứng đọc tệp từ kho rồi trích xuất văn bản + tạo lại chỉ mục RAG (dùng khi nhập liệu hàng loạt).

### Thiết lập GCP
1. Tạo bucket (uniform access, **versioning** bật, lifecycle tùy chính sách lưu trữ).
2. Service account cho Cloud Run, cấp quyền:
   - `roles/storage.objectAdmin` trên bucket (đọc/ghi/xóa object).
   - `roles/iam.serviceAccountTokenCreator` cho chính SA đó (để ký **V4 signed URL** qua `iamcredentials.signBlob` — không cần tải khóa private).
3. Cloud Run tự dùng **Application Default Credentials** (không cần `GOOGLE_APPLICATION_CREDENTIALS`).

### Xử lý ở quy mô lớn (rất nhiều minh chứng)
- Hiện tại pipeline trích xuất văn bản → chunk → embedding chạy **đồng bộ** khi upload (best-effort, không chặn nghiệp vụ nếu lỗi).
- Khi khối lượng lớn: tách phần xử lý sang **worker bất đồng bộ** (Cloud Tasks/Pub-Sub) — upload chỉ lưu tệp + đẩy message; worker gọi `processEvidenceDocument`. Nút "Xử lý lại" và trường `Document.status` đã sẵn cho mô hình này.
- Nâng RAG: thay embeddings cục bộ bằng provider thật + **pgvector / Vertex AI Vector Search** (GĐ5).

## RAG ở quy mô lớn (pgvector)
Mặc định RAG tính cosine trong app trên `DocumentChunk.embedding` (Float[256]) — chạy mọi nơi nhưng O(n). Khi minh chứng rất nhiều, bật **pgvector** để tìm kiếm vector trong CSDL có chỉ mục ANN:
```
RAG_DRIVER=pgvector
```
1. Cloud SQL: bật extension `vector` (Cloud SQL hỗ trợ pgvector).
2. Chạy một lần: `npm run rag:pgvector` — tạo `CREATE EXTENSION vector`, cột `embedding_vec vector(256)`, **chỉ mục HNSW (cosine)** và backfill từ embeddings hiện có.
3. Từ đó, mỗi minh chứng mới tự đồng bộ vector; truy hồi RAG dùng `embedding_vec <=> query` (ANN). Nếu pgvector lỗi/chưa backfill, app **tự fallback** về cosine trong app.

Cột `embedding_vec` quản lý ngoài Prisma (không trong migration) để môi trường không có pgvector không bị chặn; production dùng `prisma migrate deploy` (không kiểm tra drift). Nâng cấp tiếp: thay `embedText` heuristic bằng embeddings thật (Vertex AI / Voyage) — chỉ cần đổi `EMBEDDING_DIM` + cột `vector(N)`.

## Sao lưu & bảo mật
- Cloud SQL: bật **automated backup** + **PITR**.
- Bí mật: **Secret Manager** (không commit `.env`).
- Bật **Cloud Logging/Error Reporting**; cân nhắc Identity Platform cho SSO/MFA.

## CI
`.github/workflows/ci.yml`: cài deps → `prisma generate` → `tsc --noEmit` → `next build`.
