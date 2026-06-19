"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { Button, Input, Label } from "@/components/ui";

const DEMO_ACCOUNTS = [
  { role: "Quản trị hệ thống", email: "admin@aiqms.edu.vn" },
  { role: "Phòng Khảo thí & ĐBCL", email: "qa@aiqms.edu.vn" },
  { role: "Khoa / Viện", email: "khoa@aiqms.edu.vn" },
  { role: "Giảng viên", email: "giangvien@aiqms.edu.vn" },
  { role: "Ban Giám hiệu", email: "bgh@aiqms.edu.vn" },
];

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between bg-brand-700 p-8 text-white md:flex">
          <div>
            <div className="mb-6 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-xl font-bold">A</div>
              <span className="text-xl font-bold">AIQMS3</span>
            </div>
            <h1 className="text-2xl font-bold leading-snug">
              Quản lý đảm bảo chất lượng & kiểm định chương trình đào tạo
            </h1>
            <p className="mt-3 text-sm text-brand-100">
              Số hóa quy trình ĐBCL theo chuẩn Bộ GD&ĐT / AUN-QA, tích hợp AI hỗ trợ phân
              tích minh chứng, rà soát báo cáo và quản trị chất lượng.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/10 p-3 text-xs text-brand-50">
            <Sparkles className="h-4 w-4" />
            AI đóng vai trò gợi ý; cán bộ có thẩm quyền kiểm tra và phê duyệt.
          </div>
        </div>

        {/* Form panel */}
        <div className="p-8">
          <h2 className="text-xl font-bold text-slate-900">Đăng nhập</h2>
          <p className="mt-1 text-sm text-slate-500">Sử dụng tài khoản nội bộ của nhà trường.</p>

          <form action={formAction} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="ten@aiqms.edu.vn" required autoComplete="username" />
            </div>
            <div>
              <Label htmlFor="password">Mật khẩu</Label>
              <Input id="password" name="password" type="password" placeholder="••••••••" required autoComplete="current-password" />
            </div>

            {state.error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Đang đăng nhập…" : "Đăng nhập"}
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-600">Tài khoản demo (mật khẩu: Aiqms@123)</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email} className="flex justify-between gap-2">
                  <span>{a.role}</span>
                  <code className="text-slate-700">{a.email}</code>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
