import { LogOut, Sparkles } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { roleLabel } from "@/lib/rbac";
import { aiConfigured } from "@/lib/ai/client";
import { logoutAction } from "@/lib/actions/session";
import { initials } from "@/lib/utils";

export async function Topbar({ user }: { user: SessionUser }) {
  const aiOn = await aiConfigured();
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="text-sm text-slate-500">
        {user.department?.faculty?.name ?? user.unit ?? "Hệ thống đảm bảo chất lượng"}
      </div>

      <div className="flex items-center gap-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            aiOn ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
          }`}
          title={aiOn ? "Đã cấu hình Claude API" : "Đang dùng chế độ AI dự phòng (chưa có API key)"}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {aiOn ? "AI: Claude" : "AI: Dự phòng"}
        </span>

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
            title="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
