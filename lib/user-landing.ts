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

  const [membershipCount, existingRunCount] = await Promise.all([
    prisma.companyMembership.count({ where: { userId } }),
    prisma.memberOnboarding.count({ where: { userId } }),
  ]);
  if (!membershipCount) return null;

  const hasMissingRuns = existingRunCount < membershipCount;
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
