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

## Lưu trữ file (GCS)
`src/lib/storage.ts` có sẵn điểm mở rộng `STORAGE_DRIVER=gcs`. Bổ sung `@google-cloud/storage`,
dùng signed URL cho tệp nhạy cảm, bật versioning bucket.

## Sao lưu & bảo mật
- Cloud SQL: bật **automated backup** + **PITR**.
- Bí mật: **Secret Manager** (không commit `.env`).
- Bật **Cloud Logging/Error Reporting**; cân nhắc Identity Platform cho SSO/MFA.

## CI
`.github/workflows/ci.yml`: cài deps → `prisma generate` → `tsc --noEmit` → `next build`.
