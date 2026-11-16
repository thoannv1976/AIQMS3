import Link from "next/link";
import { notFound } from "next/navigation";
import { X, FileText, Download, RefreshCw } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canInProgram } from "@/lib/rbac";
import { programRolesOf } from "@/lib/program-context";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader, Select, Button } from "@/components/ui";
import { DescItem } from "@/components/widgets";
import { evidenceStatus, confidentiality as confMeta, documentStatus } from "@/lib/labels";
import { evidenceStrength, BAND_META } from "@/lib/quality/scoring";
import { formatDate, formatBytes } from "@/lib/utils";
import { AiPanel, StatusControl } from "./EvidenceActions";
import { unlinkCriterionAction, linkCriterionForm, reprocessEvidenceAction } from "../actions";

export default async function EvidenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const evidence = await prisma.evidence.findUnique({
    where: { id },
    include: {
      program: true,
      document: { include: { _count: { select: { chunks: true } } } },
      uploadedBy: true,
      approvedBy: true,
      cycle: { include: { standardSet: { include: { standards: { orderBy: { order: "asc" }, include: { criteria: { orderBy: { order: "asc" } } } } } } } },
      criterionLinks: { include: { criterion: { include: { standard: true } } } },
    },
  });
  if (!evidence) notFound();

  const allCriteria = evidence.cycle
    ? evidence.cycle.standardSet.standards.flatMap((s) => s.criteria)
    : [];
  const linkedIds = new Set(evidence.criterionLinks.map((l) => l.criterionId));
  const linkableCriteria = allCriteria.filter((c) => !linkedIds.has(c.id));

  const programRoles = await programRolesOf(user.id, evidence.programId);
  const canWrite = canInProgram(user.role, programRoles, "evidence:write");
  const canApprove = canInProgram(user.role, programRoles, "evidence:approve");

  const strength = evidenceStrength({
    status: evidence.status,
    hasFile: Boolean(evidence.storagePath),
    isMachineReadable: (evidence.document?._count.chunks ?? 0) > 0,
    hasSummary: Boolean(evidence.document?.summary),
    criterionLinkCount: evidence.criterionLinks.length,
  });

  return (
    <div>
      <PageHeader
        title={`${evidence.code} — ${evidence.title}`}
        description={`Minh chứng · ${evidence.program.code}`}
        actions={<Badge color={evidenceStatus[evidence.status].color}>{evidenceStatus[evidence.status].label}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin minh chứng</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 divide-slate-100">
                <DescItem label="Đơn vị cung cấp">{evidence.providerUnit ?? "—"}</DescItem>
                <DescItem label="Mức bảo mật">
                  <Badge color={confMeta[evidence.confidentiality].color}>{confMeta[evidence.confidentiality].label}</Badge>
                </DescItem>
                <DescItem label="Tệp">
                  {evidence.fileName ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-slate-400" />
                        {evidence.fileName} ({formatBytes(evidence.fileSize)})
                      </span>
                      {evidence.storagePath && (
                        <a
                          href={`/evidence/${evidence.id}/file`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          <Download className="h-3.5 w-3.5" /> Tải về
                        </a>
                      )}
                      {canWrite && evidence.storagePath && (
                        <form action={reprocessEvidenceAction.bind(null, evidence.id)}>
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                            title="Trích xuất lại văn bản, tạo lại chỉ mục RAG"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Xử lý lại
                          </button>
                        </form>
                      )}
                    </span>
                  ) : (
                    "Không có tệp"
                  )}
                </DescItem>
                <DescItem label="Phiên bản">{evidence.version}</DescItem>
                {evidence.document && (
                  <DescItem label="Trạng thái xử lý">
                    <span className="inline-flex items-center gap-2">
                      <Badge color={documentStatus(evidence.document.status).color}>
                        {documentStatus(evidence.document.status).label}
                      </Badge>
                      {evidence.document.status === "READY" && (
                        <span className="text-xs text-slate-400">{evidence.document._count.chunks} đoạn RAG</span>
                      )}
                    </span>
                  </DescItem>
                )}
                <DescItem label="Độ mạnh minh chứng">
                  <span className="inline-flex items-center gap-2">
                    <Badge color={BAND_META[strength.band].color}>
                      {strength.score}/100 · {BAND_META[strength.band].label}
                    </Badge>
                  </span>
                  {strength.reasons.length > 0 && (
                    <span className="mt-1 block text-xs text-amber-700">{strength.reasons[0]}</span>
                  )}
                </DescItem>
                <DescItem label="Người tải lên">{evidence.uploadedBy?.fullName ?? "—"}</DescItem>
                <DescItem label="Người duyệt">
                  {evidence.approvedBy ? `${evidence.approvedBy.fullName} · ${formatDate(evidence.approvedAt)}` : "—"}
                </DescItem>
              </dl>
              {evidence.description && <p className="mt-2 text-sm text-slate-600">{evidence.description}</p>}
            </CardContent>
          </Card>

          {evidence.document?.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Tóm tắt nội dung (đã trích xuất)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="prose-ai text-slate-700">{evidence.document.summary}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {evidence.document._count.chunks} đoạn văn bản đã lập chỉ mục cho hỏi đáp AI.
                </p>
              </CardContent>
            </Card>
          )}

          <AiPanel evidenceId={evidence.id} canWrite={canWrite} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Trạng thái & vòng đời</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusControl evidenceId={evidence.id} current={evidence.status} canApprove={canApprove} canWrite={canWrite} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tiêu chí liên kết ({evidence.criterionLinks.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {evidence.criterionLinks.length === 0 && <p className="text-sm text-slate-500">Chưa liên kết tiêu chí nào.</p>}
              {evidence.criterionLinks.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <div className="text-sm">
                    <span className="font-medium text-slate-800">{l.criterion.code}</span>{" "}
                    <span className="text-slate-600">{l.criterion.title}</span>
                    {l.suggestedByAi && (
                      <Badge color="purple" className="ml-1">
                        AI
                      </Badge>
                    )}
                  </div>
                  {canWrite && (
                    <form action={unlinkCriterionAction.bind(null, evidence.id, l.criterionId)}>
                      <button type="submit" className="text-slate-400 hover:text-red-500" title="Bỏ liên kết">
                        <X className="h-4 w-4" />
                      </button>
                    </form>
                  )}
                </div>
              ))}

              {canWrite && linkableCriteria.length > 0 && (
                <form action={linkCriterionForm.bind(null, evidence.id)} className="mt-3 flex gap-2">
                  <Select name="criterionId" defaultValue="" className="text-xs">
                    <option value="" disabled>
                      — Gắn tiêu chí —
                    </option>
                    {linkableCriteria.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.title}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm" variant="outline">
                    Gắn
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Link href={`/evidence?program=${evidence.programId}`} className="block text-center text-sm text-brand-600 hover:underline">
            ← Về danh sách minh chứng
          </Link>
        </div>
      </div>
    </div>
  );
}
