import Link from "next/link";
import { Check } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader, EmptyState, Button } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { markAllNotificationsReadAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title="Thông báo"
        description="Các cập nhật về nhiệm vụ, minh chứng và phân công liên quan đến bạn."
        actions={
          unread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <Button type="submit" variant="outline">
                <Check className="h-4 w-4" /> Đánh dấu đã đọc tất cả ({unread})
              </Button>
            </form>
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <EmptyState title="Không có thông báo" description="Bạn sẽ nhận thông báo khi có cập nhật liên quan." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {notifications.map((n) => {
              const inner = (
                <div className={`flex items-start gap-3 px-4 py-3 ${n.read ? "" : "bg-brand-50/40"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand-500"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800">{n.title}</div>
                    {n.message && <div className="text-sm text-slate-500">{n.message}</div>}
                    <div className="mt-0.5 text-xs text-slate-400">{formatDate(n.createdAt)}</div>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className="block hover:bg-slate-50">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
