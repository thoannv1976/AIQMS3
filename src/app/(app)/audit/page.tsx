import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, PageHeader, Badge, EmptyState, Th, Td } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

const ACTION_COLORS: Record<string, "slate" | "green" | "blue" | "amber" | "red" | "purple"> = {
  CREATE: "green",
  UPDATE: "blue",
  UPDATE_STATUS: "blue",
  APPROVE: "green",
  UPLOAD: "purple",
  DELETE: "red",
  LOGIN: "slate",
  LOGOUT: "slate",
};

export default async function AuditPage() {
  const user = await requireUser();
  if (!can(user.role, "audit:view")) redirect("/dashboard");

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { user: true },
  });

  return (
    <div>
      <PageHeader title="Nhật ký hệ thống" description="Lưu vết mọi thao tác: ai làm gì, khi nào — phục vụ minh bạch và kiểm soát" />

      {logs.length === 0 ? (
        <EmptyState title="Chưa có nhật ký" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <Th>Thời gian</Th>
                  <Th>Người dùng</Th>
                  <Th>Hành động</Th>
                  <Th>Đối tượng</Th>
                  <Th>Chi tiết</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(log.createdAt)}</Td>
                    <Td>{log.user?.fullName ?? "Hệ thống"}</Td>
                    <Td>
                      <Badge color={ACTION_COLORS[log.action] ?? "slate"}>{log.action}</Badge>
                    </Td>
                    <Td className="text-slate-600">{log.entityType}</Td>
                    <Td className="max-w-xs truncate text-xs text-slate-400">
                      {log.detail ? JSON.stringify(log.detail) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
