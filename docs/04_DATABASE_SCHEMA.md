# 04 — Database Schema

Nguồn chuẩn: [`prisma/schema.prisma`](../prisma/schema.prisma) (PostgreSQL, Prisma 7 driver adapter).
Mô hình **3 lớp**: file gốc ở object storage · metadata ở PostgreSQL · text/chunks/embeddings cho AI.

## Nhóm tổ chức & người dùng
- `University`, `Faculty`, `Department`
- `User` (email, passwordHash, role, departmentId…), `UserProgramRole` (gán vai trò theo chương trình)

## Nhóm chương trình & học thuật
- `Program`, `ProgramVersion`
- `Course`, `CourseSyllabus`
- `Plo`, `Clo`
- `CurriculumMap` (Course↔PLO, mức `ContributionLevel` I/R/M)
- `CloPloLink` (CLO↔PLO, `CloPloStrength`)
- `Rubric`

## Nhóm kiểm định
- `AccreditationStandardSet` → `Standard` → `Criterion`
- `AccreditationCycle` (chu kỳ kiểm định của 1 chương trình theo 1 bộ tiêu chuẩn)
- `Evidence` (metadata minh chứng) + `EvidenceCriterionLink` (n-n với tiêu chí, cờ `suggestedByAi`)
- `SelfAssessmentReport` → `ReportSection` (mô tả/điểm mạnh/tồn tại/kế hoạch cải tiến)
- `ImprovementPlan` (PDCA), `Recommendation`

## Nhóm dữ liệu & phân tích
- `Survey` → `SurveyQuestion` → (`SurveyResponse` → `SurveyAnswer`)
- `OutcomeAssessment` (tỷ lệ đạt PLO/CLO theo khóa/học kỳ)
- `Task` (Kanban), `Notification`

## Nhóm AI / RAG
- `Document` (text trích xuất từ minh chứng) → `DocumentChunk` (`embedding Float[]`)
- `AiAnalysisResult` (lưu mọi kết quả AI: type, target, prompt, result, `usedFallback`, `accepted`)
- `AiChatSession` → `AiChatMessage` (citations JSON)

## Nhóm kiểm soát
- `AuditLog` (action, entityType, entityId, detail, time) — index theo (entityType, entityId) & createdAt
- `ApprovalFlow` (luồng phê duyệt tổng quát)

## Enums tiêu biểu
`Role`, `DegreeLevel`, `ProgramVersionStatus`, `ContributionLevel`, `EvidenceStatus`
(UPLOADED→PROCESSING→DRAFT→SUBMITTED→REVIEWED→NEEDS_REVISION→APPROVED→USED_IN_REPORT→ARCHIVED),
`Confidentiality`, `TaskStatus`, `TaskPriority`, `ReportStatus`, `ReportSectionStatus`,
`PdcaStatus`, `SurveyAudience`, `SurveyStatus`, `QuestionType`, `AiAnalysisType`.

> **Embeddings:** MVP lưu `Float[]` và tính cosine ở ứng dụng. Production nên bật **pgvector** hoặc
> **Vertex AI Vector Search** cho quy mô lớn.
