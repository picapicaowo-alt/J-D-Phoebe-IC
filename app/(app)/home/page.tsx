import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/permissions";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import type { AccessUser } from "@/lib/access";
import { HomeAlertsSection } from "./home-alerts-section";
import { HomeDashboardSection } from "./home-dashboard-section";
import { HomeAlertsFallback, HomeDashboardFallback } from "./home-suspense-fallback";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string; skipOnboarding?: string }>;
}) {
  const user = (await requireUser()) as AccessUser;
  if (!user.companionIntroCompletedAt) redirect("/onboarding/companion");
  if (!(await userHasPermission(user, "project.read"))) redirect("/group");
  const locale = await getLocale();
  const sp = await searchParams;
  const snapshot = String(sp.snapshot ?? "").trim();
  const allowSkipOnboarding = await userHasPermission(user, "lifecycle.onboarding.skip");
  const skipOnboarding = String(sp.skipOnboarding ?? "") === "1" && allowSkipOnboarding;
  if (!skipOnboarding) {
    const { ensureAllMemberOnboardingsForUser, refreshOnboardingOverdueReminders } = await import("@/lib/member-onboarding");
    await ensureAllMemberOnboardingsForUser(user.id);
    await refreshOnboardingOverdueReminders(user.id);
    const { prisma } = await import("@/lib/prisma");
    const pendingOnboarding = await prisma.memberOnboarding.findFirst({
      where: { userId: user.id, completedAt: null },
      orderBy: { deadlineAt: "asc" },
    });
    if (pendingOnboarding) {
      redirect(`/onboarding/member?companyId=${pendingOnboarding.companyId}`);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t(locale, "homeTitle")}</h1>
        <p className="mt-2 text-base text-zinc-500 dark:text-zinc-400">{t(locale, "homeSubtitle")}</p>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-500 dark:text-zinc-400">{t(locale, "homePhilosophy")}</p>
      </div>

      <Suspense fallback={<HomeAlertsFallback />}>
        <HomeAlertsSection user={user} />
      </Suspense>

      <Suspense fallback={<HomeDashboardFallback />}>
        <HomeDashboardSection user={user} snapshot={snapshot} />
      </Suspense>
    </div>
  );
}
