# 05 — API / Server Actions

AIQMS3 dùng **Next.js Server Actions** (RPC kiểu hàm) thay cho REST truyền thống. Mỗi action kiểm tra
xác thực (`requireUser`) và quyền (`can(role, capability)`) phía máy chủ, ghi `AuditLog`, rồi
`revalidatePath`/`redirect`.

## Xác thực
- `loginAction(prev, formData)` — `src/app/login/actions.ts`
- `logoutAction()` — `src/lib/actions/session.ts`

## Chương trình
- `createProgram`, `createProgramVersion` — `programs/actions.ts`

## Minh chứng — `evidence/actions.ts`
- `uploadEvidence(prev, formData)` — lưu file (storage), tạo metadata, trích xuất text + tạo chunks/embeddings
- `summarizeEvidenceAction(id)` → AI tóm tắt
- `suggestCriteriaAction(id)` → AI gợi ý tiêu chí (kèm điểm)
- `linkCriterionAction(id, criterionId, byAi)` / `linkCriterionForm` / `unlinkCriterionAction`
- `setEvidenceStatusAction(id, status)` — vòng đời/duyệt (`evidence:approve`)

## Chuẩn đầu ra — `outcomes/actions.ts`
- `analyzeMatrixAction(programId)` → rà soát ma trận PLO–học phần (heuristic + AI)

## Báo cáo TĐG — `reports/actions.ts`
- `saveSectionAction(id, fields)`, `setReportStatusAction(id, status)`
- `draftSectionAction(id)` → AI soạn nháp · `reviewSectionAction(id)` → AI rà soát

## Nhiệm vụ — `tasks/actions.ts`
- `createTask`, `updateTaskStatusAction(id, status)`

## Cải tiến — `improvements/actions.ts`
- `createImprovement`, `updateImprovementStatusAction(id, status)`, `suggestImprovementAction(problem)`

## Khảo sát — `surveys/actions.ts`
- `analyzeSurveyAction(id)` → AI phân tích phản hồi

## Trợ lý AI — `ai-assistant/actions.ts`
- `askAction(programId, question)` → RAG (truy hồi + trả lời + citations)

## Quản trị — `admin/users/actions.ts`
- `createUser(prev, formData)`, `toggleUserActiveAction(id)`

> Quy ước: action trả `{ error }`/`{ ok }` cho form (dùng `useActionState`), hoặc trả dữ liệu cấu trúc
> cho lời gọi từ client (dùng `useTransition`). Mọi thao tác ghi `AuditLog`.
