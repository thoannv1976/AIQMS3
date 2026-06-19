"use client";

import { useActionState, useEffect, useRef } from "react";
import { UserPlus } from "lucide-react";
import { createUser, type FormState } from "./actions";
import { Button, Input, Label, Select } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/rbac";

export function CreateUserForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createUser, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="email">Email *</Label>
          <Input id="email" name="email" type="email" required placeholder="ten@aiqms.edu.vn" />
        </div>
        <div>
          <Label htmlFor="fullName">Họ và tên *</Label>
          <Input id="fullName" name="fullName" required />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="role">Vai trò</Label>
          <Select id="role" name="role" defaultValue="LECTURER">
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="title">Chức danh / đơn vị</Label>
          <Input id="title" name="title" placeholder="VD: Giảng viên bộ môn HTTT" />
        </div>
      </div>
      <div>
        <Label htmlFor="password">Mật khẩu khởi tạo</Label>
        <Input id="password" name="password" placeholder="Mặc định: Aiqms@123" />
      </div>

      {state.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      {state.ok && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Đã tạo người dùng.</div>}

      <Button type="submit" disabled={pending}>
        <UserPlus className="h-4 w-4" /> {pending ? "Đang tạo…" : "Tạo người dùng"}
      </Button>
    </form>
  );
}
