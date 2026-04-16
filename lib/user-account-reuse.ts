import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const reusableUserSelect = {
  id: true,
  deletedAt: true,
  isSuperAdmin: true,
} satisfies Prisma.UserSelect;

export type ReusableUserCandidate = Prisma.UserGetPayload<{ select: typeof reusableUserSelect }>;

type ReprovisionDeletedUserInput = {
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

export function canReuseDeletedUser(candidate: ReusableUserCandidate | null) {
  return Boolean(candidate?.deletedAt && !candidate.isSuperAdmin);
}

export async function reprovisionDeletedUser(
  tx: Prisma.TransactionClient,
  { userId, name, passwordHash, mustChangePassword, title }: ReprovisionDeletedUserInput,
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
