"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";
import { pdcaStatus } from "@/lib/labels";
import { updateImprovementStatusAction } from "./actions";
import { PdcaStatus } from "@/generated/prisma/enums";

export function PdcaSelect({ id, status, disabled }: { id: string; status: PdcaStatus; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      className="h-8 w-32 text-xs"
      value={status}
      disabled={disabled || pending}
      onChange={(e) =>
        start(async () => {
          await updateImprovementStatusAction(id, e.target.value as PdcaStatus);
          router.refresh();
        })
      }
    >
      {Object.entries(pdcaStatus).map(([k, v]) => (
        <option key={k} value={k}>
          {v.label}
        </option>
      ))}
    </Select>
  );
}
