import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { userHasPermission } from "@/lib/permissions";
import type { AccessUser } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { MemberOnboardingChecklist } from "@/components/member-onboarding-checklist";
import { acknowledgeMemberOnboardingMaterialsAction } from "@/app/actions/lifecycle";

export default async function MemberOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; onboardingErr?: string }>;
}) {
  const user = (await requireUser()) as AccessUser;
  const sp = await searchParams;
  const companyId = String(sp.companyId ?? "").trim();
  const onboardingErr = String(sp.onboardingErr ?? "").trim();
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

      {onboardingErr === "materials" ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-base text-[hsl(var(--foreground))]">{t(locale, "onboardingErrMaterials")}</p>
      ) : null}
      {onboardingErr === "order" ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-base text-[hsl(var(--foreground))]">{t(locale, "onboardingErrOrder")}</p>
      ) : null}

      <Card className="space-y-5 rounded-[12px] border border-[hsl(var(--border))] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display text-lg font-bold tracking-tight">{ob.company.name}</CardTitle>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "onboardingMemberMaterialsLead")}</p>
          </div>
          {ob.completedAt ? (
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {t(locale, "onboardingCompleted")}
            </span>
          ) : overdue ? (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-200">
              {t(locale, "onboardingOverdue")}
            </span>
          ) : null}
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "onboardingPackageLink")}</p>
            <a
              href={ob.packageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-lg font-semibold text-[hsl(var(--primary))] underline-offset-4 hover:underline"
            >
              {t(locale, "onboardingOpenPackage")}
            </a>
            <p className="mt-3 text-base leading-relaxed text-[hsl(var(--muted))]">
              {t(locale, "companyOnboardingVersion")}: {ob.packageVersion}
            </p>
          </div>
          <div className="space-y-4 text-base leading-relaxed">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "onboardingDeadline")}</p>
              <p className="mt-2 text-[hsl(var(--foreground))]">{ob.deadlineAt.toISOString().slice(0, 10)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">{t(locale, "onboardingLiaison")}</p>
              {ob.liaison ? (
                <p className="mt-2 text-[hsl(var(--foreground))]">
                  {ob.liaison.name} · <span className="text-[hsl(var(--muted))]">{ob.liaison.email}</span>
                </p>
              ) : (
                <p className="mt-2 text-[hsl(var(--muted))]">{t(locale, "staffSupervisorNone")}</p>
              )}
            </div>
          </div>
        </div>

        {!ob.completedAt && !ob.materialsOpenedAt ? (
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <p className="font-medium text-[hsl(var(--foreground))]">{t(locale, "onboardingMaterialsAckTitle")}</p>
            <p className="mt-2 text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "onboardingMaterialsAckHelp")}</p>
            <form action={acknowledgeMemberOnboardingMaterialsAction} className="mt-4">
              <input type="hidden" name="onboardingId" value={ob.id} />
              <Button type="submit" variant="secondary">
                {t(locale, "onboardingMaterialsAckBtn")}
              </Button>
            </form>
          </div>
        ) : null}
        {ob.materialsOpenedAt && !ob.completedAt ? (
          <p className="text-base text-emerald-700 dark:text-emerald-300">
            {t(locale, "onboardingMaterialsOpenedAt")}: {ob.materialsOpenedAt.toISOString().slice(0, 16).replace("T", " ")}
          </p>
        ) : null}
      </Card>

      {ob.completedAt ? (
        <Card className="space-y-3 rounded-[12px] border border-[hsl(var(--border))] p-5">
          <CardTitle className="font-display text-base font-bold">{t(locale, "onboardingResourcesAfterComplete")}</CardTitle>
          <p className="text-base leading-relaxed text-[hsl(var(--muted))]">{t(locale, "onboardingResourcesAfterCompleteHelp")}</p>
          <a
            href={ob.packageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex font-medium text-[hsl(var(--primary))] hover:underline"
          >
            {t(locale, "onboardingOpenPackage")}
          </a>
        </Card>
      ) : null}

      <Card className="space-y-3 rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display text-base font-bold">{t(locale, "onboardingChecklist")}</CardTitle>
        <MemberOnboardingChecklist
          items={ob.checklistItems}
          locale={locale}
          readOnly={Boolean(ob.completedAt)}
          materialsOpenedAt={ob.materialsOpenedAt}
        />
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
