-- CreateEnum
CREATE TYPE "ImprovementPhase" AS ENUM ('BEFORE', 'AFTER');

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "assessor" TEXT,
ADD COLUMN     "improvementPlanId" TEXT,
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "response" TEXT;

-- CreateTable
CREATE TABLE "ImprovementEvidenceLink" (
    "id" TEXT NOT NULL,
    "improvementId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "phase" "ImprovementPhase" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImprovementEvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImprovementEvidenceLink_improvementId_evidenceId_phase_key" ON "ImprovementEvidenceLink"("improvementId", "evidenceId", "phase");

-- AddForeignKey
ALTER TABLE "ImprovementEvidenceLink" ADD CONSTRAINT "ImprovementEvidenceLink_improvementId_fkey" FOREIGN KEY ("improvementId") REFERENCES "ImprovementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementEvidenceLink" ADD CONSTRAINT "ImprovementEvidenceLink_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_improvementPlanId_fkey" FOREIGN KEY ("improvementPlanId") REFERENCES "ImprovementPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
