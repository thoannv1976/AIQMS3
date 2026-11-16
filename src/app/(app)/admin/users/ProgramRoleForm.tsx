"use client";

import { useActionState } from "react";
import { Button, Label, Select } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import { assignProgramRoleAction, type FormState } from "./actions";

interface UserLite {
  id: string;
  fullName: string;
}
interface ProgramLite {
  id: string;
  code: string;
  nameVi: string;
}

// Program-scoped roles only make sense for non-institution roles.
const SCOPED_ROLES: Role[] = [Role.FACULTY, Role.DEPARTMENT, Role.LECTURER, Role.QA_OFFICE];

export function ProgramRoleForm({ users, programs }: { users: UserLite[]; programs: ProgramLite[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(assignProgramRoleAction, {});

  return (
    <form action={action} className="space-y-3">
      <div>
        <Label>Người dùng</Label>
        <Select name="userId" required defaultValue="">
          <option value="" disabled>
            Chọn người dùng…
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Chương trình</Label>
        <Select name="programId" required defaultValue="">
          <option value="" disabled>
            Chọn chương trình…
          </option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.nameVi}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Vai trò trong chương trình</Label>
        <Select name="role" defaultValue={Role.FACULTY}>
          {SCOPED_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">Đã gán vai trò.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Đang gán…" : "Gán vai trò"}
      </Button>
    </form>
  );
}
