import { redirect } from "next/navigation";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { storageDriver } from "@/lib/storage";
import { getAiConfig, AI_MODE_LABELS } from "@/lib/ai/config";
import { AI_LAST_ERROR_KEY } from "@/lib/ai/client";
import { pgVectorEnabled } from "@/lib/ai/vector";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, Badge, Th, Td } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import pkg from "../../../../../package.json";

export const dynamic = "force-dynamic";

function Ok({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-green-600" : warn ? "text-amber-500" : "text-red-600"}`} />
      <div>{children}</div>
    </div>
  );
}

async function loadStatus() {
  const now = new Date();
  const t0 = now.getTime();
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const dbMs = Date.now() - t0;
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [counts, docStatus, lastMigration, lastCron, ai24, aiFail24, ai] = await Promise.all([
    Promise.all([prisma.user.count(), prisma.program.count(), prisma.evidence.count(), prisma.document.count(), prisma.reportSection.count(), prisma.survey.count()]),
    prisma.document.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at DESC NULLS LAST LIMIT 1`.catch(() => []),
    prisma.auditLog.findFirst({ where: { action: "CRON_REMINDERS" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: since } } }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: since }, success: false } }),
    getAiConfig(),
  ]);
  const lastErrRow = await prisma.appSetting.findUnique({ where: { key: AI_LAST_ERROR_KEY } });
  const aiLastError = (lastErrRow?.value ?? null) as { at: string; message: string } | null;
  const [users, programs, evidence, documents, sections, surveys] = counts;
  const doc = Object.fromEntries(docStatus.map((d) => [d.status, d._count._all])) as Record<string, number>;
  const stuck = (doc.PENDING ?? 0) + (doc.PROCESSING ?? 0);
  const failed = doc.FAILED ?? 0;
  const aiLive = ai.mode !== "mock" && Boolean(ai.apiKey);
  const cronAgeH = lastCron ? (Date.now() - lastCron.createdAt.getTime()) / 3600000 : null;
  return { dbOk, dbMs, users, programs, evidence, documents, sections, surveys, doc, stuck, failed, aiLive, ai, ai24, aiFail24, lastCron, cronAgeH, lastMigration, now, aiLastError };
}

export default async function SystemStatusPage() {
  const user = await requireUser();
  if (!can(user.role, "admin:settings")) redirect("/dashboard");

  const { dbOk, dbMs, users, programs, evidence, documents, sections, surveys, doc, stuck, failed, aiLive, ai, ai24, aiFail24, lastCron, cronAgeH, lastMigration, now, aiLastError } = await loadStatus();
  const driver = storageDriver();

  return (
    <div>
      <PageHeader title="Tình trạng hệ thống" description="Kiểm tra nhanh cơ sở dữ liệu, lưu trữ, AI, xử lý minh chứng, nhắc việc và sao lưu" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Dịch vụ</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            <Ok ok={dbOk}>Cơ sở dữ liệu {dbOk ? `kết nối tốt (${dbMs} ms)` : "KHÔNG kết nối được"} · tìm kiếm vector {pgVectorEnabled() ? "pgvector" : "trong ứng dụng"}</Ok>
            <Ok ok={driver === "gcs"} warn={driver !== "gcs"}>Lưu trữ tệp: {driver === "gcs" ? `Google Cloud Storage (${process.env.GCS_BUCKET ?? "?"})` : "thư mục cục bộ (chỉ dùng khi phát triển)"}</Ok>
            <Ok ok={aiLive} warn={!aiLive}>AI: {AI_MODE_LABELS[ai.mode]}{aiLive ? ` · ${ai.model}` : " · chưa có khóa API, đang dùng quy tắc dự phòng"} · 24h qua {ai24} lượt gọi{aiFail24 ? `, ${aiFail24} lỗi` : ""}</Ok>
            {aiLastError && aiFail24 > 0 && (
              <Ok ok={false}>
                Lỗi AI gần nhất ({formatDateTime(aiLastError.at)}): <span className="font-mono text-xs">{aiLastError.message}</span>
                {/credit balance/i.test(aiLastError.message) && <div className="text-xs text-red-700">→ Tài khoản Anthropic hết credit: nạp thêm tại console.anthropic.com › Plans &amp; Billing, AI sẽ tự hoạt động lại.</div>}
              </Ok>
            )}
            <Ok ok={!failed && stuck < 5} warn={stuck >= 5 && !failed}>Xử lý minh chứng: {doc.READY ?? 0} sẵn sàng · {stuck} đang chờ/đang xử lý · {failed} lỗi{failed ? " (mở minh chứng › Xử lý lại)" : ""}</Ok>
            <Ok ok={cronAgeH !== null && cronAgeH < 30} warn={cronAgeH === null || cronAgeH >= 30}>Nhắc việc tự động: {lastCron ? `lần chạy gần nhất ${formatDateTime(lastCron.createdAt)}` : "chưa ghi nhận lần chạy nào"}</Ok>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Phiên bản & dữ liệu</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr><Th className="w-48">Ứng dụng</Th><Td>AIQMS3 v{pkg.version} {process.env.K_REVISION ? <Badge color="slate">{process.env.K_REVISION}</Badge> : null}</Td></tr>
                <tr><Th>Cấu trúc dữ liệu</Th><Td className="text-xs">{lastMigration[0]?.migration_name ?? "—"}</Td></tr>
                <tr><Th>Người dùng / chương trình</Th><Td>{users} / {programs}</Td></tr>
                <tr><Th>Minh chứng / tài liệu đã trích xuất</Th><Td>{evidence} / {documents}</Td></tr>
                <tr><Th>Mục báo cáo / khảo sát</Th><Td>{sections} / {surveys}</Td></tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Sao lưu & khôi phục</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <Ok ok>Cơ sở dữ liệu (Cloud SQL): sao lưu tự động hằng ngày, giữ 7 bản gần nhất; khôi phục về thời điểm bất kỳ trong 7 ngày (point-in-time recovery).</Ok>
            <Ok ok>Kho tệp minh chứng (Cloud Storage): lưu nhiều phiên bản đối tượng; tệp bị xóa còn khôi phục được trong 7 ngày (soft delete).</Ok>
            <Ok ok>Trong ứng dụng: mỗi minh chứng giữ lịch sử phiên bản tệp; mỗi mục báo cáo giữ lịch sử chỉnh sửa và các phiên bản đã chốt.</Ok>
            <p className="pt-1 text-xs text-slate-500">
              Khôi phục cơ sở dữ liệu thực hiện trên Google Cloud Console › SQL › aiqms-db › Sao lưu (cần quyền quản trị dự án). Nên chốt phiên bản báo cáo và xuất hồ sơ zip trước các mốc quan trọng.
            </p>
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-slate-400">Cập nhật lúc {formatDateTime(now)}.</p>
    </div>
  );
}
