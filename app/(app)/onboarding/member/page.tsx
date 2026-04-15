import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import type { AccessUser } from "@/lib/access";
import { Card, CardTitle } from "@/components/ui/card";
import { MemberOnboardingChecklist } from "@/components/member-onboarding-checklist";

export default async function MemberOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const user = (await requireUser()) as AccessUser;
  const sp = await searchParams;
  const companyId = String(sp.companyId ?? "").trim();
  if (!companyId) redirect("/onboarding");

  const { ensureMemberOnboardingForCompany } = await import("@/lib/member-onboarding");
  await ensureMemberOnboardingForCompany(user.id, companyId);

  const ob = await prisma.memberOnboarding.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
    include: { checklistItems: { orderBy: { sortOrder: "asc" } }, company: true, liaison: true },
  });
  if (!ob) redirect("/onboarding");

  const locale = await getLocale();
  const overdue = !ob.completedAt && ob.deadlineAt.getTime() < Date.now();
  const canSkipGate = await userHasPermission(user, "lifecycle.onboarding.skip");

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-[hsl(var(--foreground))] md:text-3xl">
          {t(locale, "onboardingMemberTitle")}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/onboarding" className="text-sm font-medium text-[hsl(var(--primary))] hover:underline">
            {t(locale, "navOnboarding")}
          </Link>
          {canSkipGate ? (
            <Link href="/home?skipOnboarding=1" className="text-sm font-medium text-[hsl(var(--primary))] hover:underline">
              {t(locale, "navHome")}
            </Link>
          ) : (
            <Link href="/home" className="text-sm font-medium text-[hsl(var(--primary))] hover:underline">
              {t(locale, "navHome")}
            </Link>
          )}
        </div>
      </div>

      <Card className="space-y-4 rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display text-lg font-bold tracking-tight">{ob.company.name}</CardTitle>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "onboardingPackageLink")}</p>
            <a
              href={ob.packageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex font-medium text-[hsl(var(--primary))] hover:underline"
            >
              {t(locale, "onboardingOpenPackage")}
            </a>
            <p className="mt-1 text-xs text-[hsl(var(--muted))]">
              {t(locale, "companyOnboardingVersion")}: {ob.packageVersion}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "onboardingDeadline")}</p>
            <p className="mt-1 text-[hsl(var(--foreground))]">{ob.deadlineAt.toISOString().slice(0, 10)}</p>
            {overdue ? (
              <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">{t(locale, "onboardingOverdue")}</p>
            ) : null}
            {ob.completedAt ? (
              <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">{t(locale, "onboardingCompleted")}</p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "onboardingLiaison")}</p>
            {ob.liaison ? (
              <p className="mt-1 text-[hsl(var(--foreground))]">
                {ob.liaison.name} · <span className="text-[hsl(var(--muted))]">{ob.liaison.email}</span>
              </p>
            ) : (
              <p className="mt-1 text-[hsl(var(--muted))]">{t(locale, "staffSupervisorNone")}</p>
            )}
          </div>
        </div>
      </Card>

      <Card className="space-y-3 rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display text-base font-bold">{t(locale, "onboardingChecklist")}</CardTitle>
        {ob.completedAt ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{t(locale, "onboardingCompleted")}</p>
        ) : (
          <MemberOnboardingChecklist items={ob.checklistItems} locale={locale} />
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/calendar?create=1&sourceKind=ONBOARDING&sourceId=${ob.id}`}
          className="inline-flex items-center justify-center rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
        >
          {t(locale, "calendarNewEvent")}
        </Link>
      </div>
    </div>
  );
}
