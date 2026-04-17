"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OrgGroupStatus, CompanyStatus, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { verifyAccountSetupToken } from "@/lib/account-setup";
import { getAppSession, invalidateAccessUserCache } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { ensureMemberOnboardingForCompany } from "@/lib/member-onboarding";
import { invalidatePermissionCache } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canReuseUserAccount, findReusableUserCandidateByEmail, reprovisionReusableUser } from "@/lib/user-account-reuse";

const DEFAULT_REGISTER_ROLE_KEY = "COMPANY_CONTRIBUTOR";

async function persistLoginSession(userId: string) {
  const session = await getAppSession();
  session.userId = userId;
  session.isLoggedIn = true;
  await session.save();
}

export async function completeAccountSetupAction(formData: FormData) {
  if (isClerkEnabled()) {
    redirect("/sign-in");
  }

  const token = String(formData.get("token") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const tokenQuery = encodeURIComponent(token);

  if (!token || newPassword.length < 8 || newPassword !== confirmPassword) {
    redirect(`/setup-account?token=${tokenQuery}&error=invalid_password`);
  }

  const verification = verifyAccountSetupToken(token);
  if (!verification.ok) {
    redirect("/register");
  }

  const passwordHash = await hash(newPassword, 10);

  if (verification.payload.kind === "register") {
    const { email, name } = verification.payload;
    const existing = await findReusableUserCandidateByEmail(email);
    const reusableExisting = canReuseUserAccount(existing) ? existing : null;
    if (existing && !reusableExisting) {
      redirect(`/setup-account?token=${tokenQuery}&error=email_taken`);
    }

    const company = await prisma.company.findFirst({
      where: {
        deletedAt: null,
        status: CompanyStatus.ACTIVE,
        orgGroup: { deletedAt: null, status: OrgGroupStatus.ACTIVE },
      },
      orderBy: { createdAt: "asc" },
    });

    const role = await prisma.roleDefinition.findUnique({
      where: { key: DEFAULT_REGISTER_ROLE_KEY },
    });

    if (!company || !role) {
      redirect(`/setup-account?token=${tokenQuery}&error=setup_missing`);
    }

    try {
      const user = await prisma.$transaction(async (tx) => {
        const u = reusableExisting
          ? await reprovisionReusableUser(tx, {
              userId: reusableExisting.id,
              name,
              passwordHash,
              mustChangePassword: false,
            })
          : await tx.user.create({
              data: {
                email,
                passwordHash,
                name,
                active: true,
              },
            });

        await tx.companyMembership.upsert({
          where: { userId_companyId: { userId: u.id, companyId: company.id } },
          create: {
            userId: u.id,
            companyId: company.id,
            roleDefinitionId: role.id,
          },
          update: {
            roleDefinitionId: role.id,
            departmentId: null,
            supervisorUserId: null,
          },
        });

        return u;
      });

      invalidateAccessUserCache(user);
      invalidatePermissionCache(user.id);
      await ensureMemberOnboardingForCompany(user.id, company.id);
      await writeAudit({
        actorId: null,
        entityType: "USER",
        entityId: user.id,
        action: "CREATE",
        newValue: user.email,
        meta: "account_setup:self_register",
      });
      await persistLoginSession(user.id);
      redirect("/onboarding/companion");
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        redirect(`/setup-account?token=${tokenQuery}&error=email_taken`);
      }
      throw error;
    }
  }

  const invite = await prisma.staffInvite.findFirst({
    where: { id: verification.payload.inviteId, consumedAt: null },
  });
  if (!invite || invite.email !== verification.payload.email) {
    redirect(`/setup-account?token=${tokenQuery}&error=invalid`);
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.staffInvite.delete({ where: { id: invite.id } }).catch(() => {});
    redirect(`/setup-account?token=${tokenQuery}&error=invalid`);
  }

  const existing = await findReusableUserCandidateByEmail(invite.email);
  const reusableExisting = canReuseUserAccount(existing) ? existing : null;
  if (existing && !reusableExisting) {
    redirect(`/setup-account?token=${tokenQuery}&error=email_taken`);
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = reusableExisting
        ? await reprovisionReusableUser(tx, {
            userId: reusableExisting.id,
            name: invite.name,
            title: invite.title,
            passwordHash,
            mustChangePassword: false,
          })
        : await tx.user.create({
            data: {
              email: invite.email,
              name: invite.name,
              title: invite.title,
              passwordHash,
              active: true,
              mustChangePassword: false,
            },
          });

      await tx.staffInvite.delete({ where: { id: invite.id } });
      return u;
    });

    invalidateAccessUserCache(user);
    invalidatePermissionCache(user.id);
    await writeAudit({
      actorId: invite.createdByUserId,
      entityType: "USER",
      entityId: user.id,
      action: "CREATE",
      newValue: user.email,
      meta: "account_setup:staff_invite",
    });
    revalidatePath("/staff");
    await persistLoginSession(user.id);
    redirect("/onboarding/companion");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/setup-account?token=${tokenQuery}&error=email_taken`);
    }
    throw error;
  }
}
