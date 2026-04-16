"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { OrgGroupStatus, CompanyStatus, Prisma } from "@prisma/client";
import { getAppSession, invalidateAccessUserCache } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { ensureMemberOnboardingForCompany } from "@/lib/member-onboarding";
import { invalidatePermissionCache } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canReuseUserAccount, findReusableUserCandidateByEmail, reprovisionReusableUser } from "@/lib/user-account-reuse";

export type RegisterActionResult =
  | {
      ok: false;
      messageKey:
        | "registerEmailTaken"
        | "registerWeakPassword"
        | "registerSetupMissing"
        | "registerInvalidEmail"
        | "homeRegisterErrorGeneric"
        | "homeRegisterClerkHint";
    }
  | null;

const DEFAULT_REGISTER_ROLE_KEY = "COMPANY_CONTRIBUTOR";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function registerAction(formData: FormData): Promise<RegisterActionResult> {
  if (isClerkEnabled()) {
    return { ok: false, messageKey: "homeRegisterClerkHint" };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!isValidEmail(email)) {
    return { ok: false, messageKey: "registerInvalidEmail" };
  }
  if (password.length < 8) {
    return { ok: false, messageKey: "registerWeakPassword" };
  }
  if (!name || name.length > 120) {
    return { ok: false, messageKey: "homeRegisterErrorGeneric" };
  }

  const existing = await findReusableUserCandidateByEmail(email);
  const reusableExisting = canReuseUserAccount(existing) ? existing : null;
  if (existing && !reusableExisting) {
    return { ok: false, messageKey: "registerEmailTaken" };
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
    return { ok: false, messageKey: "registerSetupMissing" };
  }

  const passwordHash = await hash(password, 10);

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

    const session = await getAppSession();
    session.userId = user.id;
    session.isLoggedIn = true;
    await session.save();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, messageKey: "registerEmailTaken" };
    }
    return { ok: false, messageKey: "homeRegisterErrorGeneric" };
  }

  redirect("/onboarding/companion");
}

export async function registerFormAction(
  _prev: RegisterActionResult | null,
  formData: FormData,
): Promise<RegisterActionResult> {
  return registerAction(formData);
}
