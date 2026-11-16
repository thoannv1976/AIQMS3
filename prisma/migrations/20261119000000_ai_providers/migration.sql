-- Multi-provider AI + budgets: provider/tier on usage log, index for per-user daily spend

-- AlterTable
ALTER TABLE "AiUsageLog" ADD COLUMN "provider" TEXT,
ADD COLUMN "tier" TEXT;

-- CreateIndex
CREATE INDEX "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog"("userId", "createdAt");
