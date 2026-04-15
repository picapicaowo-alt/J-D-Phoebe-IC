import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";

/**
 * Fast path: pending onboarding redirect only. Heavy ensure/refresh runs via `after()` on the page.
 */
export async function HomeMemberOnboardingRedirect({ user, skipOnboardingQuery }: { user: AccessUser; skipOnboardingQuery: string }) {
  const allowSkipOnboarding = await userHasPermission(user, "lifecycle.onboarding.skip");
  const skipOnboarding = skipOnboardingQuery === "1" && allowSkipOnboarding;
  if (skipOnboarding) return null;

  const pendingOnboarding = await prisma.memberOnboarding.findFirst({
    where: { userId: user.id, completedAt: null },
    orderBy: { deadlineAt: "asc" },
  });
  if (pendingOnboarding) {
    redirect(`/onboarding/member?companyId=${pendingOnboarding.companyId}`);
  }
  return null;
}
