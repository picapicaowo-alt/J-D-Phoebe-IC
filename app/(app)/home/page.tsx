import { Suspense } from "react";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/permissions";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import type { AccessUser } from "@/lib/access";
import { AlertsSection } from "./home-alerts-section";
import { HomeDashboardStreams } from "./home-dashboard-streams";
import { HomeMemberOnboardingRedirect } from "./home-member-onboarding-redirect";
import { HomeAlertsFallback } from "./home-suspense-fallback";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string; skipOnboarding?: string }>;
}) {
  const user = (await requireUser()) as AccessUser;
  if (!user.companionIntroCompletedAt) redirect("/onboarding/companion");
  if (!(await userHasPermission(user, "project.read"))) redirect("/group");

  const sp = await searchParams;
  const snapshot = String(sp.snapshot ?? "").trim();
  const skipOnboardingQuery = String(sp.skipOnboarding ?? "");

  after(async () => {
    try {
      const m = await import("@/lib/member-onboarding");
      await m.ensureAllMemberOnboardingsForUser(user.id);
      await m.refreshOnboardingOverdueReminders(user.id);
    } catch (err) {
      console.error("[home member onboarding after]", err);
    }
  });

  const locale = await getLocale();

  return (
    <div className="space-y-8">
      <Suspense fallback={null}>
        <HomeMemberOnboardingRedirect user={user} skipOnboardingQuery={skipOnboardingQuery} />
      </Suspense>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t(locale, "homeTitle")}</h1>
        <p className="mt-2 text-base text-zinc-500 dark:text-zinc-400">{t(locale, "homeSubtitle")}</p>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-500 dark:text-zinc-400">{t(locale, "homePhilosophy")}</p>
      </div>

      <Suspense fallback={<HomeAlertsFallback />}>
        <AlertsSection user={user} />
      </Suspense>

      <HomeDashboardStreams user={user} snapshot={snapshot} />
    </div>
  );
}
