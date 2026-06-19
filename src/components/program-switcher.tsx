"use client";

import { useRouter, usePathname } from "next/navigation";
import type { ProgramLite } from "@/lib/program-context";

export function ProgramSwitcher({ programs, selectedId }: { programs: ProgramLite[]; selectedId?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  if (programs.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">Chương trình:</span>
      <select
        value={selectedId ?? ""}
        onChange={(e) => router.push(`${pathname}?program=${e.target.value}`)}
        className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        {programs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} — {p.nameVi}
          </option>
        ))}
      </select>
    </div>
  );
}
