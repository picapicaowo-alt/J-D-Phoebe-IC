"use client";

import { usePathname } from "next/navigation";
import { setLocaleAction } from "@/app/actions/locale";
import type { Locale } from "@/lib/locale";
import { FormSubmitButton } from "@/components/form-submit-button";

export function LocaleToggleHeader({ locale }: { locale: Locale }) {
  const pathname = usePathname() || "/home";
  const nextLocale = locale === "en" ? "zh" : "en";
  const label = locale === "en" ? "中文" : "EN";

  return (
    <form action={setLocaleAction}>
      <input type="hidden" name="locale" value={nextLocale} />
      <input type="hidden" name="next" value={pathname} />
      <FormSubmitButton type="submit" variant="ghost" className="h-8 translate-y-px rounded-full px-3 text-xs font-medium">
        {label}
      </FormSubmitButton>
    </form>
  );
}
