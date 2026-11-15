"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button, Input, Label, Select } from "@/components/ui";
import { createFacultyAction, createDepartmentAction, type OrgFormState } from "./actions";

function Msg({ s }: { s: OrgFormState }) {
  if (s.error) return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{s.error}</div>;
  if (s.ok) return <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{s.ok}</div>;
  return null;
}

export function CreateFacultyForm() {
  const [state, action, pending] = useActionState<OrgFormState, FormData>(createFacultyAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="f-code">Mã khoa *</Label>
          <Input id="f-code" name="code" required placeholder="VD: SBI" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="f-name">Tên khoa / viện *</Label>
          <Input id="f-name" name="name" required placeholder="VD: Viện Kinh doanh Quốc tế" />
        </div>
      </div>
      <Msg s={state} />
      <Button type="submit" size="sm" disabled={pending}>
        <Plus className="h-4 w-4" /> Thêm khoa
      </Button>
    </form>
  );
}

export function CreateDepartmentForm({ faculties }: { faculties: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<OrgFormState, FormData>(createDepartmentAction, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <Label htmlFor="d-fac">Thuộc khoa *</Label>
        <Select id="d-fac" name="facultyId" required defaultValue="">
          <option value="" disabled>
            — Chọn khoa —
          </option>
          {faculties.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="d-code">Mã bộ môn *</Label>
          <Input id="d-code" name="code" required placeholder="VD: SBI-QTKD" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="d-name">Tên bộ môn *</Label>
          <Input id="d-name" name="name" required placeholder="VD: Bộ môn Quản trị kinh doanh" />
        </div>
      </div>
      <Msg s={state} />
      <Button type="submit" size="sm" disabled={pending}>
        <Plus className="h-4 w-4" /> Thêm bộ môn
      </Button>
    </form>
  );
}
