import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";

export default async function OnboardingHubPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "lifecycle.onboarding.hub"))) redirect("/home");

  const rows = await prisma.memberOnboarding.findMany({
    where: { userId: user.id },
    include: { company: true },
    orderBy: { deadlineAt: "asc" },
  });

  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-container space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">{t(locale, "navOnboarding")}</h1>
      <p className="text-sm leading-relaxed text-[hsl(var(--muted))]">{t(locale, "onboardingHubLead")}</p>
      <Card className="rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display text-base font-bold">{t(locale, "onboardingHubListTitle")}</CardTitle>
        {!rows.length ? (
          <p className="mt-3 text-sm text-[hsl(var(--muted))]">{t(locale, "onboardingHubEmpty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-[hsl(var(--border))] text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                <div>
                  <p className="font-medium text-[hsl(var(--foreground))]">{r.company.name}</p>
                  <p className="text-xs text-[hsl(var(--muted))]">
                    {t(locale, "onboardingDeadline")}: {r.deadlineAt.toISOString().slice(0, 10)}
                    {r.completedAt ? ` · ${t(locale, "onboardingCompleted")}` : ""}
                  </p>
                </div>
                {!r.completedAt ? (
                  <Link
                    href={`/onboarding/member?companyId=${r.companyId}`}
                    className="rounded-[6px] bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {t(locale, "onboardingHubContinue")}
                  </Link>
                ) : (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">{t(locale, "onboardingCompleted")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
