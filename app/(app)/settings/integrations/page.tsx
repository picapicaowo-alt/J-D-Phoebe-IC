import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";

export default async function IntegrationsSettingsPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "project.read"))) redirect("/group");
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-container space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/home" className="hover:underline">
          {t(locale, "navHome")}
        </Link>{" "}
        / {t(locale, "integrationsTitle")}
      </div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">{t(locale, "integrationsTitle")}</h1>
      <p className="max-w-2xl text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "integrationsLead")}</p>

      <Card className="space-y-3 rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display text-base font-bold">{t(locale, "integrationsInternalCalendarTitle")}</CardTitle>
        <p className="text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "integrationsInternalCalendarBody")}</p>
      </Card>

      <Card className="space-y-3 rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display text-base font-bold">{t(locale, "integrationsEmailTitle")}</CardTitle>
        <p className="text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "integrationsEmailBody")}</p>
        <p className="text-sm leading-relaxed text-[hsl(var(--muted))]">{t(locale, "integrationsEmailEnv")}</p>
        <p className="text-sm leading-relaxed text-[hsl(var(--muted))]">{t(locale, "integrationsEmailEnvSmtp")}</p>
      </Card>
    </div>
  );
}
