import { redirect } from "next/navigation";
import { updateCompanionAction } from "@/app/actions/companion";
import { requireUser } from "@/lib/auth";
import { getCompanionManifestForUser } from "@/lib/companion-manifest";
import type { AccessUser } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
export default async function CompanionOnboardingPage() {
  const user = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  if (user.companionIntroCompletedAt) redirect("/home");

  const manifest = getCompanionManifestForUser(user);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card className="space-y-4 p-6">
        <CardTitle>{t(locale, "onboardCompanionTitle")}</CardTitle>
        <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "onboardCompanionLead")}</p>
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-[hsl(var(--foreground))]">
          {t(locale, "companionPermanentWarning")}
        </p>
        <form action={updateCompanionAction} className="space-y-4">
          <input type="hidden" name="next" value="home" />
          <div className="space-y-2">
            <p className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "staffSpecies")}</p>
            <div className="grid grid-cols-4 gap-2">
              {manifest.map((e) => (
                <label
                  key={e.id}
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-[hsl(var(--border))] p-2 has-[:checked]:border-[hsl(var(--accent))] has-[:checked]:ring-1 has-[:checked]:ring-[hsl(var(--accent))]"
                >
                  <input type="radio" name="species" value={e.species} defaultChecked={e.species === "BUNNY"} className="sr-only" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.file} alt="" width={48} height={48} className="h-12 w-12 object-contain" />
                  <span className="text-center text-xs text-[hsl(var(--muted))]">
                    {locale === "zh" ? e.name_zh : e.name_en}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "staffDisplayName")}</label>
            <Input name="name" placeholder={t(locale, "onboardCompanionNamePh")} required maxLength={40} />
          </div>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "onboardCompanionLevelHint")}</p>
          <Button type="submit" className="w-full">
            {t(locale, "onboardCompanionSave")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
