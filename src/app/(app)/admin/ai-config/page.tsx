import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getAiConfig } from "@/lib/ai/config";
import { periodStarts } from "@/lib/ai/budget";
import { LOCALAI_DEFAULT_BASE_URL, PROVIDERS, PROVIDER_IDS } from "@/lib/ai/providers";
import { AI_LAST_ERROR_KEY } from "@/lib/ai/client";
import { builtinPricing, featureLabel, formatTokens, formatUsd, formatVnd, USD_TO_VND } from "@/lib/ai/usage";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, Td, Th } from "@/components/ui";
import { Progress } from "@/components/widgets";
import { formatDateTime } from "@/lib/utils";
import { ProvidersAndRouting, BudgetForm, PriceTable } from "./AiConfigForm";

export const dynamic = "force-dynamic";

async function loadUsage() {
  const { month, day } = periodStarts();
  const real = { usedFallback: false };
  const [monthAgg, dayAgg, allAgg, byProvider, byFeature, byUser, recent, monthLogs, lastErr, models] = await Promise.all([
    prisma.aiUsageLog.aggregate({ where: { ...real, createdAt: { gte: month } }, _sum: { costUsd: true, totalTokens: true }, _count: { _all: true } }),
    prisma.aiUsageLog.aggregate({ where: { ...real, createdAt: { gte: day } }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.aiUsageLog.aggregate({ where: real, _sum: { costUsd: true, totalTokens: true }, _count: { _all: true } }),
    prisma.aiUsageLog.groupBy({ by: ["provider"], where: { ...real, createdAt: { gte: month } }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.aiUsageLog.groupBy({ by: ["feature"], where: { ...real, createdAt: { gte: month } }, _sum: { costUsd: true, totalTokens: true }, _count: { _all: true } }),
    prisma.aiUsageLog.groupBy({ by: ["userId"], where: { ...real, createdAt: { gte: month } }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.aiUsageLog.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { user: { select: { fullName: true } } } }),
    prisma.aiUsageLog.findMany({ where: { ...real, createdAt: { gte: month } }, select: { createdAt: true, costUsd: true } }),
    prisma.appSetting.findUnique({ where: { key: AI_LAST_ERROR_KEY } }),
    prisma.aiUsageLog.findMany({ distinct: ["model", "provider"], where: real, select: { model: true, provider: true } }),
  ]);
  const fallbackCount = await prisma.aiUsageLog.count({ where: { usedFallback: true, createdAt: { gte: month } } });
  const users = await prisma.user.findMany({ where: { id: { in: byUser.map((u) => u.userId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
  // Spend per day of the current month (Vietnam time).
  const perDay = new Map<string, number>();
  for (const l of monthLogs) {
    const k = new Date(l.createdAt.getTime() + 7 * 3600 * 1000).toISOString().slice(8, 10);
    perDay.set(k, (perDay.get(k) ?? 0) + l.costUsd);
  }
  return {
    month: monthAgg._sum.costUsd ?? 0, monthCalls: monthAgg._count._all, monthTokens: monthAgg._sum.totalTokens ?? 0,
    day: dayAgg._sum.costUsd ?? 0, dayCalls: dayAgg._count._all,
    all: allAgg._sum.costUsd ?? 0, allCalls: allAgg._count._all, fallbackCount,
    byProvider: byProvider.map((p) => ({ provider: p.provider ?? "anthropic", cost: p._sum.costUsd ?? 0, calls: p._count._all })),
    byFeature: byFeature.map((f) => ({ feature: f.feature, cost: f._sum.costUsd ?? 0, tokens: f._sum.totalTokens ?? 0, calls: f._count._all })).sort((a, b) => b.cost - a.cost).slice(0, 10),
    byUser: byUser.map((u) => ({ name: u.userId ? nameOf.get(u.userId) ?? "—" : "Hệ thống (nền)", cost: u._sum.costUsd ?? 0, calls: u._count._all })).sort((a, b) => b.cost - a.cost).slice(0, 10),
    perDay: [...perDay.entries()].sort(),
    recent,
    lastErr: (lastErr?.value ?? null) as { at: string; message: string } | null,
    usedModels: [...new Set(models.map((m) => m.model).filter((m) => m !== "fallback-heuristic"))],
    localModels: models.filter((m) => PROVIDERS[(m.provider ?? "anthropic") as keyof typeof PROVIDERS]?.local).map((m) => m.model),
  };
}

export default async function AiConfigPage() {
  const actor = await requireUser();
  if (!can(actor.role, "admin:settings")) redirect("/dashboard");
  const [cfg, u] = await Promise.all([getAiConfig(), loadUsage()]);
  const b = cfg.budget;
  const pct = (spent: number, limit: number | null) => (limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0);
  const warn = (spent: number, limit: number | null) => limit != null && spent >= limit * b.warnPct;
  const priceModels = [...new Set([cfg.tiers.high.model, cfg.tiers.economy.model, ...u.usedModels, ...Object.keys(cfg.prices)])].filter(Boolean);
  const maxDay = Math.max(0.0001, ...u.perDay.map(([, v]) => v));
  // Models served by the self-hosted LocalAI cost nothing per token.
  const localModels = new Set([...Object.values(cfg.tiers).filter((t) => PROVIDERS[t.provider].local).map((t) => t.model), ...u.localModels]);

  return (
    <div className="space-y-6">
      <PageHeader title="Cấu hình AI" description="Nhà cung cấp (Claude, OpenAI, Gemini, LocalAI nội bộ), phân tầng mô hình, hạn mức chi phí và theo dõi sử dụng AI toàn hệ thống." />

      {(warn(u.month, b.monthlyUsd) || warn(u.day, b.dailyUsd)) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Chi phí AI đã vượt ngưỡng cảnh báo {Math.round(b.warnPct * 100)}% hạn mức{u.month >= (b.monthlyUsd ?? Infinity) || u.day >= (b.dailyUsd ?? Infinity) ? " – AI đang tạm dừng, chỉ dùng chế độ quy tắc." : "."}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Ngân sách & chi tiêu</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ["Tháng này", u.month, b.monthlyUsd, `${u.monthCalls} lượt gọi`],
                ["Hôm nay", u.day, b.dailyUsd, `${u.dayCalls} lượt gọi`],
                ["Từ trước đến nay", u.all, null, `${u.allCalls} lượt gọi thật`],
              ] as const
            ).map(([label, spent, limit, sub]) => (
              <div key={label} className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{formatUsd(spent)} <span className="text-sm font-normal text-slate-500">{limit != null ? `/ $${limit}` : ""}</span></div>
                <div className="text-xs text-slate-500">{formatVnd(spent)} · {sub}</div>
                {limit != null && <div className="mt-2"><Progress value={pct(spent, limit)} /></div>}
              </div>
            ))}
          </div>
          {u.perDay.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-slate-600">Chi tiêu theo ngày trong tháng</div>
              <div className="flex h-24 items-end gap-1">
                {u.perDay.map(([d, v]) => (
                  <div key={d} className="flex flex-1 flex-col items-center" title={`Ngày ${d}: ${formatUsd(v)}`}>
                    <div className="w-full rounded-t bg-brand-500" style={{ height: `${Math.max(3, (v / maxDay) * 80)}px` }} />
                    <span className="mt-0.5 text-[10px] text-slate-400">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <BudgetForm budget={b} autoEvidenceCheck={cfg.autoEvidenceCheck} rate={USD_TO_VND} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Nhà cung cấp & phân tầng mô hình</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {u.lastErr && (
            <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">Lỗi AI gần nhất ({formatDateTime(u.lastErr.at)}): {u.lastErr.message}</p>
          )}
          <ProvidersAndRouting
            providers={PROVIDER_IDS.map((id) => ({ id, label: PROVIDERS[id].label, keyHint: PROVIDERS[id].keyHint, last4: cfg.keys[id].last4, source: cfg.keys[id].source, ready: cfg.keys[id].ready, local: Boolean(PROVIDERS[id].local), suggested: PROVIDERS[id].suggested, consoleUrl: PROVIDERS[id].consoleUrl }))}
            routing={{ mode: cfg.mode, high: cfg.tiers.high, economy: cfg.tiers.economy, fallback: cfg.fallback }}
            localai={{ baseUrl: cfg.localai.baseUrl, source: cfg.localai.source, defaultUrl: LOCALAI_DEFAULT_BASE_URL }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bảng đơn giá</CardTitle></CardHeader>
        <CardContent>
          <PriceTable rows={priceModels.map((m) => ({ model: m, builtin: localModels.has(m) ? { input: 0, output: 0 } : builtinPricing(m), override: cfg.prices[m] ?? null, used: m === cfg.tiers.high.model || m === cfg.tiers.economy.model }))} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Tháng này theo tính năng</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {u.byProvider.map((p) => <Badge key={p.provider} color="blue">{PROVIDERS[p.provider as keyof typeof PROVIDERS]?.label ?? p.provider}: {formatUsd(p.cost)} · {p.calls} lượt</Badge>)}
              <Badge color="slate">Dự phòng/chặn: {u.fallbackCount}</Badge>
            </div>
            <table className="w-full text-sm">
              <thead><tr><Th>Tính năng</Th><Th className="text-right">Lượt</Th><Th className="text-right">Token</Th><Th className="text-right">Chi phí</Th></tr></thead>
              <tbody>{u.byFeature.map((f) => <tr key={f.feature}><Td>{featureLabel(f.feature)}</Td><Td className="text-right">{f.calls}</Td><Td className="text-right">{formatTokens(f.tokens)}</Td><Td className="text-right">{formatUsd(f.cost)}</Td></tr>)}</tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tháng này theo người dùng</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr><Th>Người dùng</Th><Th className="text-right">Lượt</Th><Th className="text-right">Chi phí</Th></tr></thead>
              <tbody>{u.byUser.map((x, i) => <tr key={i}><Td>{x.name}</Td><Td className="text-right">{x.calls}</Td><Td className="text-right">{formatUsd(x.cost)}</Td></tr>)}</tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Lượt gọi AI gần đây</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr><Th>Thời gian</Th><Th>Tính năng</Th><Th>Người dùng</Th><Th>Nhà cung cấp / mô hình</Th><Th className="text-right">Vào / Ra</Th><Th className="text-right">Chi phí</Th><Th>Trạng thái</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {u.recent.map((r) => (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.createdAt)}</Td>
                    <Td>{featureLabel(r.feature)}{r.tier ? <span className="ml-1 text-[10px] text-slate-400">{r.tier === "high" ? "cao" : "tiết kiệm"}</span> : null}</Td>
                    <Td className="text-xs">{r.user?.fullName ?? "—"}</Td>
                    <Td className="text-xs">{r.usedFallback && r.model === "fallback-heuristic" ? "—" : `${PROVIDERS[(r.provider ?? "anthropic") as keyof typeof PROVIDERS]?.label ?? r.provider} · ${r.model}`}</Td>
                    <Td className="text-right text-xs">{formatTokens(r.inputTokens)} / {formatTokens(r.outputTokens)}</Td>
                    <Td className="text-right text-xs">{formatUsd(r.costUsd)}</Td>
                    <Td>{!r.success ? <Badge color="red">Lỗi</Badge> : r.usedFallback ? <Badge color="amber">Dự phòng</Badge> : <Badge color="green">OK</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
