-- Rounds 1–2: AI evidence check on upload + program key facts

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN "aiCheck" JSONB,
ADD COLUMN "aiCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProgramFact" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "groupName" TEXT,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "period" TEXT,
    "sourceCode" TEXT,
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramFact_programId_idx" ON "ProgramFact"("programId");

-- AddForeignKey
ALTER TABLE "ProgramFact" ADD CONSTRAINT "ProgramFact_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
