"use client";

import { useActionState } from "react";
import { createProgram, type FormState } from "../actions";
import { Button, Input, Label, Select, Textarea, LinkButton } from "@/components/ui";

export function ProgramForm({ faculties }: { faculties: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createProgram, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="code">Mã chương trình *</Label>
          <Input id="code" name="code" placeholder="VD: MIS" required />
        </div>
        <div>
          <Label htmlFor="facultyId">Khoa / Viện *</Label>
          <Select id="facultyId" name="facultyId" required defaultValue="">
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
      </div>

      <div>
        <Label htmlFor="nameVi">Tên chương trình (tiếng Việt) *</Label>
        <Input id="nameVi" name="nameVi" placeholder="VD: Hệ thống thông tin quản lý" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="degreeLevel">Trình độ</Label>
          <Select id="degreeLevel" name="degreeLevel" defaultValue="BACHELOR">
            <option value="BACHELOR">Đại học</option>
            <option value="MASTER">Thạc sĩ</option>
            <option value="DOCTORATE">Tiến sĩ</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="totalCredits">Tổng số tín chỉ</Label>
          <Input id="totalCredits" name="totalCredits" type="number" placeholder="VD: 130" />
        </div>
      </div>

      <div>
        <Label htmlFor="objectives">Mục tiêu đào tạo</Label>
        <Textarea id="objectives" name="objectives" rows={3} placeholder="Mô tả ngắn mục tiêu đào tạo…" />
      </div>

      {state.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Tạo chương trình"}
        </Button>
        <LinkButton href="/programs" variant="outline">
          Hủy
        </LinkButton>
      </div>
    </form>
  );
}
