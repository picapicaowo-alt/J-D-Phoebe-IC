import { prisma } from "@/lib/prisma";

export async function getPendingMemberOnboardingRoute(userId: string) {
  const { ensureAllMemberOnboardingsForUser } = await import("@/lib/member-onboarding");
  await ensureAllMemberOnboardingsForUser(userId);

  const pendingOnboarding = await prisma.memberOnboarding.findFirst({
    where: { userId, completedAt: null },
    orderBy: [{ deadlineAt: "asc" }, { createdAt: "asc" }],
    select: { companyId: true },
  });

  return pendingOnboarding ? `/onboarding/member?companyId=${pendingOnboarding.companyId}` : null;
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
