"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";

export async function setLocaleAction(locale: Locale): Promise<void> {
  const c = await cookies();
  c.set(LOCALE_COOKIE, locale === "en" ? "en" : "vi", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
