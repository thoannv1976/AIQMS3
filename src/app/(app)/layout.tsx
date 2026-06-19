import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { NAV_GROUPS } from "@/lib/nav";
import { can } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => can(user.role, i.capability)),
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
