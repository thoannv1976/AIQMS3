import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { NAV_GROUPS } from "@/lib/nav";
import { can } from "@/lib/rbac";
import { getLocale } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const locale = await getLocale();

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    title: locale === "en" ? g.titleEn : g.title,
    items: g.items
      .filter((i) => can(user.role, i.capability))
      .map((i) => ({ ...i, label: locale === "en" ? i.labelEn : i.label })),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={groups} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={user} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
