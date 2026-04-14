import { setLocaleAction } from "@/app/actions/locale";
import type { Locale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

/** Primary site-wide language control (cookie). Button label is the language you switch *to*. */
export function HomeLocaleToggle({ locale }: { locale: Locale }) {
  const nextLocale = locale === "en" ? "zh" : "en";
  const buttonLabel = locale === "en" ? "中文" : "EN";
  return (
    <Card className="border-[hsl(var(--accent))]/25 bg-[hsl(var(--accent))]/5 p-4">
      <CardTitle className="text-base">{t(locale, "localeToggleTitle")}</CardTitle>
      <p className="mt-1 text-xs text-[hsl(var(--muted))]">
        {t(locale, "localeToggleHint")} {locale === "en" ? "English" : "中文"}
      </p>
      <form action={setLocaleAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="locale" value={nextLocale} />
        <input type="hidden" name="next" value="/home" />
        <Button type="submit" variant="secondary" className="h-11 min-w-[100px] text-base font-semibold">
          {buttonLabel}
        </Button>
        <span className="text-xs text-[hsl(var(--muted))]">
          {t(locale, nextLocale === "zh" ? "localeToggleAfterZh" : "localeToggleAfterEn")}
        </span>
      </form>
    </Card>
  );
}
