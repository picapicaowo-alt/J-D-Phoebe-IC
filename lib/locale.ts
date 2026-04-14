import { cookies } from "next/headers";

export type Locale = "en" | "zh";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get("locale")?.value;
  return v === "zh" ? "zh" : "en";
}
