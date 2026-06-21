import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getAiConfig, AI_MODE_LABELS } from "@/lib/ai/config";
import {
  featureLabel,
  formatTokens,
  formatUsd,
  formatVnd,
  pricingFor,
  USD_TO_VND,
} from "@/lib/ai/usage";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { AiConfigForm } from "./AiConfigForm";

export const dynamic = "force-dynamic";

export default async function AiConfigPage() {
  const actor = await requireUser();
  if (!can(actor.role, "admin:settings")) redirect("/dashboard");

  const cfg = await getAiConfig();
  const liveOn = cfg.mode !== "mock" && Boolean(cfg.apiKey);

  const [agg, byFeatureRaw, byFallback, recent] = await Promise.all([
    prisma.aiUsageLog.aggregate({
      _count: { _all: true },
      _sum: { totalTokens: true, inputTokens: true, outputTokens: true, costUsd: true },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["feature"],
      _count: { _all: true },
      _sum: { totalTokens: true, costUsd: true },
    }),
    prisma.aiUsageLog.groupBy({ by: ["usedFallback"], _count: { _all: true } }),
    prisma.aiUsageLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { fullName: true } } },
    }),
  ]);

  const totalCalls = agg._count._all;
  const totalTokens = agg._sum.totalTokens ?? 0;
  const totalCost = agg._sum.costUsd ?? 0;
  const realCalls = byFallback.find((b) => !b.usedFallback)?._count._all ?? 0;
  const fallbackCalls = byFallback.find((b) => b.usedFallback)?._count._all ?? 0;

  const byFeature = byFeatureRaw
    .map((f) => ({
      feature: f.feature,
      calls: f._count._all,
      tokens: f._sum.totalTokens ?? 0,
      cost: f._sum.costUsd ?? 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const price = pricingFor(cfg.model);

  return (
    <div>
      <PageHeader
        title="Cấu hình AI"
        description="Quản lý khóa API Claude, chế độ hoạt động và theo dõi token/chi phí sử dụng AI toàn hệ thống."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------------- Configuration ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Cấu hình AI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Bộ AI hiện dùng</dt>
                <dd>
                  {liveOn ? (
                    <Badge color="green">Claude API (chấm thật)</Badge>
                  ) : cfg.mode === "mock" ? (
                    <Badge color="amber">Mô phỏng (luôn dự phòng)</Badge>
                  ) : (
                    <Badge color="amber">Dự phòng (chưa có key)</Badge>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Model</dt>
                <dd className="font-medium text-slate-900">{cfg.model}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Chế độ</dt>
                <dd className="text-slate-700">{AI_MODE_LABELS[cfg.mode]}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">API key</dt>
                <dd className="text-slate-700">
                  {cfg.keySource === "none" ? (
                    <span className="text-amber-700">Chưa cấu hình</span>
                  ) : (
                    <>
                      Đã cấu hình ••••{cfg.apiKeyLast4}{" "}
                      <span className="text-xs text-slate-400">
                        (nguồn: {cfg.keySource === "db" ? "CSDL" : "biến môi trường"})
                      </span>
                    </>
                  )}
                </dd>
              </div>
            </dl>

            <hr className="border-slate-100" />

            <AiConfigForm
              current={{
                model: cfg.model,
                mode: cfg.mode,
                keySource: cfg.keySource,
                apiKeyLast4: cfg.apiKeyLast4,
              }}
            />

            <p className="text-xs text-slate-400">
              Đơn giá ước tính cho {cfg.model}: ${price.input}/1M token vào · ${price.output}/1M token ra. Tỷ giá hiển
              thị: 1 USD ≈ {formatTokens(USD_TO_VND)}đ.
            </p>
          </CardContent>
        </Card>

        {/* ---------------- Usage summary ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Sử dụng AI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Số lần gọi" value={formatTokens(totalCalls)} />
              <Stat label="Tổng token" value={formatTokens(totalTokens)} />
              <Stat label="Ước tính chi phí" value={formatUsd(totalCost)} sub={formatVnd(totalCost)} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge color="green">Gọi Claude thật: {formatTokens(realCalls)}</Badge>
              <Badge color="slate">Dùng dự phòng: {formatTokens(fallbackCalls)}</Badge>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Chi tiết theo tính năng</div>
              {byFeature.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa có lượt gọi AI nào được ghi nhận.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-slate-100 bg-slate-50">
                      <tr>
                        <Th>Tính năng</Th>
                        <Th className="text-right">Lần gọi</Th>
                        <Th className="text-right">Token</Th>
                        <Th className="text-right">Chi phí</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {byFeature.map((f) => (
                        <tr key={f.feature}>
                          <Td>{featureLabel(f.feature)}</Td>
                          <Td className="text-right">{formatTokens(f.calls)}</Td>
                          <Td className="text-right">{formatTokens(f.tokens)}</Td>
                          <Td className="text-right">{formatUsd(f.cost)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Recent calls ---------------- */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Lượt gọi AI gần đây</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Chưa có dữ liệu.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <Th>Thời gian</Th>
                    <Th>Tính năng</Th>
                    <Th>Người dùng</Th>
                    <Th>Model</Th>
                    <Th className="text-right">Vào / Ra</Th>
                    <Th className="text-right">Chi phí</Th>
                    <Th>Trạng thái</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.createdAt)}</Td>
                      <Td>{featureLabel(r.feature)}</Td>
                      <Td className="text-slate-600">{r.user?.fullName ?? "—"}</Td>
                      <Td className="text-xs text-slate-500">{r.model}</Td>
                      <Td className="whitespace-nowrap text-right text-xs text-slate-600">
                        {formatTokens(r.inputTokens)} / {formatTokens(r.outputTokens)}
                      </Td>
                      <Td className="text-right">{formatUsd(r.costUsd)}</Td>
                      <Td>
                        {!r.success ? (
                          <Badge color="red">Lỗi</Badge>
                        ) : r.usedFallback ? (
                          <Badge color="slate">Dự phòng</Badge>
                        ) : (
                          <Badge color="green">Claude</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
