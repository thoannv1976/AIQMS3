-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AiAnalysisType" ADD VALUE 'OCR';
ALTER TYPE "AiAnalysisType" ADD VALUE 'INTERVIEW_QUESTIONS';
ALTER TYPE "AiAnalysisType" ADD VALUE 'LEADERSHIP_BRIEF';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EXTERNAL_REVIEWER';

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT,
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Survey" ADD COLUMN     "closesAt" TIMESTAMP(3),
ADD COLUMN     "criterionId" TEXT,
ADD COLUMN     "opensAt" TIMESTAMP(3),
ADD COLUMN     "publicToken" TEXT;

-- AlterTable
ALTER TABLE "SurveyResponse" ADD COLUMN     "clientKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EvidenceFileVersion" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "storagePath" TEXT,
    "checksum" TEXT,
    "note" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceFileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportVersion" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSectionRevision" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "content" TEXT,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "improvementPlan" TEXT,
    "status" "ReportSectionStatus" NOT NULL,
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSectionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceFileVersion_evidenceId_idx" ON "EvidenceFileVersion"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportVersion_reportId_label_key" ON "ReportVersion"("reportId", "label");

-- CreateIndex
CREATE INDEX "ReportSectionRevision_sectionId_createdAt_idx" ON "ReportSectionRevision"("sectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_key_key" ON "ReminderLog"("key");

-- CreateIndex
CREATE INDEX "Evidence_programId_checksum_idx" ON "Evidence"("programId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "Survey_publicToken_key" ON "Survey"("publicToken");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFileVersion" ADD CONSTRAINT "EvidenceFileVersion_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFileVersion" ADD CONSTRAINT "EvidenceFileVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SelfAssessmentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSectionRevision" ADD CONSTRAINT "ReportSectionRevision_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ReportSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSectionRevision" ADD CONSTRAINT "ReportSectionRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
