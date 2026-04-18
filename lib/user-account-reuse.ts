import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const reusableUserSelect = {
  id: true,
  active: true,
  deletedAt: true,
  isSuperAdmin: true,
  passwordHash: true,
  _count: {
    select: {
      groupMemberships: true,
      companyMemberships: true,
      projectMemberships: true,
    },
  },
} satisfies Prisma.UserSelect;

export type ReusableUserCandidate = Prisma.UserGetPayload<{ select: typeof reusableUserSelect }>;

type ReprovisionReusableUserInput = {
  userId: string;
  name: string;
  passwordHash: string;
  mustChangePassword: boolean;
  title?: string | null;
};

export async function findReusableUserCandidateByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: reusableUserSelect,
  });
}

function hasNoAccessAssignments(candidate: ReusableUserCandidate) {
  return (
    candidate._count.groupMemberships === 0 &&
    candidate._count.companyMemberships === 0 &&
    candidate._count.projectMemberships === 0
  );
}

export function canReuseUserAccount(candidate: ReusableUserCandidate | null) {
  if (!candidate || candidate.isSuperAdmin) return false;
  if (Boolean(candidate.deletedAt)) return true;
  // Only treat no-membership accounts as reusable if they never completed registration (no password set).
  // This prevents re-registration of active self-registered users who just haven't been assigned yet.
  return hasNoAccessAssignments(candidate) && !candidate.passwordHash;
}

export async function reprovisionReusableUser(
  tx: Prisma.TransactionClient,
  { userId, name, passwordHash, mustChangePassword, title }: ReprovisionReusableUserInput,
) {
  await tx.groupMembership.deleteMany({ where: { userId } });
  await tx.companyMembership.deleteMany({ where: { userId } });
  await tx.projectMembership.deleteMany({ where: { userId } });
  await tx.memberOnboarding.deleteMany({ where: { userId } });
  await tx.companionProfile.deleteMany({ where: { userId } });

  return tx.user.update({
    where: { id: userId },
    data: {
      name,
      ...(title !== undefined ? { title } : {}),
      passwordHash,
      active: true,
      deletedAt: null,
      mustChangePassword,
      firstSignInAt: null,
      companionIntroCompletedAt: null,
      clerkId: null,
    },
  });
}
