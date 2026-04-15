import { cookies } from "next/headers";
import { cache } from "react";

export type Locale = "en" | "zh";

/** Dedupes `cookies()` reads when layout + page both call `getLocale()` in the same request. */
export const getLocale = cache(async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get("locale")?.value;
  return v === "zh" ? "zh" : "en";
});
