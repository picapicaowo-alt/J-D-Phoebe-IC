import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";

export default async function IntegrationsSettingsPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "project.read"))) redirect("/group");
  const locale = await getLocale();
  const canGoogle = await userHasPermission(user, "lifecycle.calendar.google");
  const cred = await prisma.googleCalendarCredential.findUnique({ where: { userId: user.id } });

  return (
    <div className="mx-auto max-w-container space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/home" className="hover:underline">
          {t(locale, "navHome")}
        </Link>{" "}
        / {t(locale, "integrationsTitle")}
      </div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">{t(locale, "integrationsTitle")}</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted))]">{t(locale, "integrationsLead")}</p>

      <Card className="space-y-3 rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display text-base font-bold">{t(locale, "integrationsGoogleTitle")}</CardTitle>
        <p className="text-sm leading-relaxed text-[hsl(var(--muted))]">{t(locale, "integrationsGoogleBody")}</p>
        {!canGoogle ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">{t(locale, "integrationsGoogleNoPerm")}</p>
        ) : cred ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">{t(locale, "integrationsGoogleLinked")}</p>
        ) : (
          <a
            href="/api/integrations/google-calendar"
            className="inline-flex items-center justify-center rounded-[6px] bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white"
          >
            {t(locale, "integrationsGoogleConnect")}
          </a>
        )}
        <p className="text-xs leading-relaxed text-[hsl(var(--muted))]">{t(locale, "integrationsGoogleEnv")}</p>
      </Card>

      <Card className="space-y-3 rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display text-base font-bold">{t(locale, "integrationsEmailTitle")}</CardTitle>
        <p className="text-sm leading-relaxed text-[hsl(var(--muted))]">{t(locale, "integrationsEmailBody")}</p>
        <p className="text-xs leading-relaxed text-[hsl(var(--muted))]">{t(locale, "integrationsEmailEnv")}</p>
      </Card>
    </div>
  );
}
