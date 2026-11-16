import { LogOut, Sparkles } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleLabel } from "@/lib/rbac";
import { aiConfigured } from "@/lib/ai/client";
import { logoutAction } from "@/lib/actions/session";
import { initials } from "@/lib/utils";
import { getLocale, t } from "@/lib/i18n";
import { NotificationBell } from "./NotificationBell";
import { LanguageToggle } from "./LanguageToggle";

export async function Topbar({ user }: { user: SessionUser }) {
  const [aiOn, notifications, locale] = await Promise.all([
    aiConfigured(),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    getLocale(),
  ]);
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="text-sm text-slate-500">
        {user.department?.faculty?.name ?? user.unit ?? t(locale, "orgFallback")}
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            aiOn ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
          }`}
          title={aiOn ? t(locale, "aiConfigured") : t(locale, "aiFallbackHint")}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {aiOn ? t(locale, "aiClaude") : t(locale, "aiFallback")}
        </span>

        <LanguageToggle locale={locale} />

        <NotificationBell
          items={notifications.map((n) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            link: n.link,
            read: n.read,
            createdAt: n.createdAt.toISOString(),
          }))}
        />

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {initials(user.fullName)}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-medium text-slate-900">{user.fullName}</div>
            <div className="text-[11px] text-slate-500">{roleLabel(user.role)}</div>
          </div>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title={t(locale, "logout")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
