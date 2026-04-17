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
    prisma.companyMembership.findMany({ where: { userId }, select: { companyId: true } }),
    prisma.memberOnboarding.findMany({ where: { userId }, select: { companyId: true } }),
  ]);
  if (!memberships.length) return null;

  const existingCompanyIds = new Set(existingRuns.map((run) => run.companyId));
  const hasMissingRuns = memberships.some((membership) => !existingCompanyIds.has(membership.companyId));
  if (!hasMissingRuns) return null;

  const { ensureAllMemberOnboardingsForUser } = await import("@/lib/member-onboarding");
  await ensureAllMemberOnboardingsForUser(userId);
  return findPendingMemberOnboardingRoute(userId);
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
