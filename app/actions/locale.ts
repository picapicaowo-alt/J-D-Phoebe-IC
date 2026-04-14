"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Locale } from "@/lib/locale";

export async function setLocaleAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "").trim() as Locale;
  if (locale !== "en" && locale !== "zh") throw new Error("Invalid locale");
  (await cookies()).set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  const next = String(formData.get("next") ?? "").trim();
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
}
