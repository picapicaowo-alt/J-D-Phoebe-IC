import { setLocaleAction } from "@/app/actions/locale";
import type { Locale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  return (
    <form action={setLocaleAction} className="flex items-center gap-1 text-xs">
      <span className="text-[hsl(var(--muted))]">{t(locale, "language")}:</span>
      <input type="hidden" name="locale" value={locale === "en" ? "zh" : "en"} />
      <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
        {locale === "en" ? t(locale, "zh") : t(locale, "en")}
      </Button>
    </form>
  );
}
