"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setLocaleAction } from "@/lib/actions/locale";

export function LanguageToggle({ locale }: { locale: "vi" | "en" }) {
  const [pending, start] = useTransition();
  const next = locale === "vi" ? "en" : "vi";
  return (
    <button
      type="button"
      onClick={() => start(() => setLocaleAction(next))}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
      title="Ngôn ngữ / Language"
    >
      <Globe className="h-4 w-4" />
      {locale.toUpperCase()}
    </button>
  );
}
