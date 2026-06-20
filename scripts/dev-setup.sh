#!/usr/bin/env bash
# Idempotent bootstrap for AIQMS3 dev / Claude Code web sessions.
# Ensures: .env, PostgreSQL running, deps installed, Prisma client generated,
# migrations applied, and demo data seeded (only when the DB is empty).
# Always exits 0 so it never blocks a session start.
set +e
cd "$(dirname "$0")/.." || exit 0
ROOT="$(pwd)"

echo "[aiqms setup] starting in $ROOT"

# 1) Default local .env (dev only; production uses injected env vars / Secret Manager)
if [ ! -f .env ]; then
  echo "[aiqms setup] creating default .env"
  cat > .env <<'ENV'
DATABASE_URL="postgresql://aiqms:aiqms_dev_pw@127.0.0.1:5432/aiqms?schema=public"
AUTH_SECRET="dev-only-secret-change-me-in-production-please-32+chars"
AUTH_SESSION_DAYS="7"
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL="claude-opus-4-8"
STORAGE_DRIVER="local"
STORAGE_LOCAL_DIR="./storage"
NODE_ENV="development"
APP_NAME="AIQMS3"
ENV
fi

# 2) Start PostgreSQL (Ubuntu cluster) if not reachable
if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  echo "[aiqms setup] starting PostgreSQL"
  service postgresql start >/dev/null 2>&1 || pg_ctlcluster 16 main start >/dev/null 2>&1
  sleep 3
  su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='aiqms'\" | grep -q 1 || psql -c \"CREATE USER aiqms WITH PASSWORD 'aiqms_dev_pw' SUPERUSER;\"" >/dev/null 2>&1
  su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='aiqms'\" | grep -q 1 || psql -c \"CREATE DATABASE aiqms OWNER aiqms;\"" >/dev/null 2>&1
fi

# 3) Dependencies
if [ ! -d node_modules ]; then
  echo "[aiqms setup] installing dependencies"
  npm install --no-audit --no-fund >/dev/null 2>&1
fi

# 4) Prisma client + migrations
echo "[aiqms setup] prisma generate + migrate"
npx prisma generate >/dev/null 2>&1
npx prisma migrate deploy >/dev/null 2>&1

# 5) Seed only if DB is empty
USERS=$(PGPASSWORD=aiqms_dev_pw psql -h 127.0.0.1 -U aiqms -d aiqms -tAc 'SELECT count(*) FROM "User"' 2>/dev/null)
if [ "${USERS:-0}" = "0" ]; then
  echo "[aiqms setup] seeding demo data"
  npm run db:seed >/dev/null 2>&1
else
  echo "[aiqms setup] DB already has ${USERS} users, skip seed"
fi

echo "[aiqms setup] done. Run 'npm run dev' to start."
exit 0
