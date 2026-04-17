import { prisma } from "@/lib/prisma";

async function findPendingMemberOnboardingRoute(userId: string) {
  const pendingOnboarding = await prisma.memberOnboarding.findFirst({
    where: { userId, completedAt: null },
    orderBy: [{ deadlineAt: "asc" }, { createdAt: "asc" }],
    select: { companyId: true },
  });

  return pendingOnboarding ? `/onboarding/member?companyId=${pendingOnboarding.companyId}` : null;
}

export async function getPendingMemberOnboardingRoute(userId: string) {
  const pendingRoute = await findPendingMemberOnboardingRoute(userId);
  if (pendingRoute) return pendingRoute;

  const [memberships, existingRuns] = await Promise.all([
    prisma.companyMembership.findMany({
      where: { userId, company: { deletedAt: null } },
      orderBy: { companyId: "asc" },
      select: { companyId: true },
    }),
    prisma.memberOnboarding.findMany({
      where: { userId },
      select: { companyId: true },
    }),
  ]);
  if (!memberships.length) return null;

  const existingCompanyIds = new Set(existingRuns.map((run) => run.companyId));
  const missingMembership = memberships.find((membership) => !existingCompanyIds.has(membership.companyId));
  return missingMembership ? `/onboarding/member?companyId=${missingMembership.companyId}` : null;
}

export async function getSignedInRedirectPath({
  userId,
  mustChangePassword,
  companionIntroCompletedAt,
}: {
  userId: string;
  mustChangePassword: boolean;
  companionIntroCompletedAt: Date | null | undefined;
}) {
  if (mustChangePassword) return "/settings/change-password";
  if (!companionIntroCompletedAt) return "/onboarding/companion";
  return (await getPendingMemberOnboardingRoute(userId)) ?? "/home";
}

export function getFastSignedInRedirectPath({
  mustChangePassword,
  companionIntroCompletedAt,
}: {
  mustChangePassword: boolean;
  companionIntroCompletedAt: Date | null | undefined;
}) {
  if (mustChangePassword) return "/settings/change-password";
  if (!companionIntroCompletedAt) return "/onboarding/companion";
  return "/home";
}
