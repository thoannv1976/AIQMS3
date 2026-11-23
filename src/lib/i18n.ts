import { cookies } from "next/headers";

export type Locale = "vi" | "en";
export const LOCALE_COOKIE = "aiqms_locale";

/** Current UI locale from cookie (default Vietnamese). Server-only. */
export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  return c.get(LOCALE_COOKIE)?.value === "en" ? "en" : "vi";
}

// Dictionary for the app shell (nav labels live on NAV_GROUPS). Page bodies are
// translated incrementally; data uses nameVi/nameEn.
const DICT = {
  vi: {
    logout: "Đăng xuất",
    notifications: "Thông báo",
    aiClaude: "AI: Claude",
    aiFallback: "AI: Dự phòng",
    aiConfigured: "Đã cấu hình AI",
    aiFallbackHint: "Đang dùng chế độ AI dự phòng (chưa cấu hình AI)",
    orgFallback: "Hệ thống đảm bảo chất lượng",
    language: "Ngôn ngữ / Language",
  },
  en: {
    logout: "Log out",
    notifications: "Notifications",
    aiClaude: "AI: Claude",
    aiFallback: "AI: Fallback",
    aiConfigured: "AI provider configured",
    aiFallbackHint: "Using AI fallback mode (no AI provider configured)",
    orgFallback: "Quality Assurance System",
    language: "Ngôn ngữ / Language",
  },
} as const;

export type DictKey = keyof (typeof DICT)["vi"];
export function t(locale: Locale, key: DictKey): string {
  return DICT[locale][key];
}
