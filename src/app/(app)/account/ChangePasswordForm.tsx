"use client";

import { useActionState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { changePasswordAction, type PasswordState } from "./actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="max-w-sm space-y-3">
      <div>
        <Label htmlFor="current">Mật khẩu hiện tại</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <Label htmlFor="next">Mật khẩu mới</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <Label htmlFor="confirm">Nhập lại mật khẩu mới</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">Đã đổi mật khẩu.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Đang lưu…" : "Đổi mật khẩu"}
      </Button>
    </form>
  );
}
