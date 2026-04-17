"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CompanyStatus, OrgGroupStatus, type CompanionSpecies } from "@prisma/client";
import { invalidateAccessUserCache, requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { ensureMemberOnboardingForCompany } from "@/lib/member-onboarding";
import { invalidatePermissionCache } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCompanionManifest, getCompanionManifestForUser } from "@/lib/companion-manifest";

const userInclude = {
  groupMemberships: { include: { roleDefinition: true, orgGroup: true } },
  companyMemberships: { include: { roleDefinition: true, company: true } },
  projectMemberships: { include: { roleDefinition: true, project: { include: { company: true } } } },
} as const;
const DEFAULT_REGISTER_ROLE_KEY = "COMPANY_CONTRIBUTOR";

function must(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function updateCompanionAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const species = must(formData, "species") as CompanionSpecies;
  const name = String(formData.get("name") ?? "").trim() || null;
  const targetUserId = String(formData.get("userId") ?? "").trim() || actor.id;
  const companyId = String(formData.get("companyId") ?? "").trim() || null;

  if (targetUserId !== actor.id && !actor.isSuperAdmin) {
    throw new Error("Only a superadmin can change another user’s companion.");
  }

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
    include: userInclude,
  });
  if (!target) throw new Error("User not found");

  const locked = Boolean(target.companionIntroCompletedAt);
  const editingSelf = targetUserId === actor.id;
  if (locked && !actor.isSuperAdmin) {
    throw new Error("Companion choice is permanent for your account. Contact a superadmin to change it.");
  }
  const requiresInitialCompany =
    editingSelf &&
    !actor.isSuperAdmin &&
    !target.isSuperAdmin &&
    !target.companionIntroCompletedAt &&
    target.companyMemberships.length === 0;
  let assignedCompanyId: string | null = null;

  if (requiresInitialCompany) {
    if (!companyId) {
      redirect("/onboarding/companion?error=company_required");
    }
    const [selectedCompany, role] = await Promise.all([
      prisma.company.findFirst({
        where: {
          id: companyId,
          deletedAt: null,
          status: CompanyStatus.ACTIVE,
          orgGroup: { deletedAt: null, status: OrgGroupStatus.ACTIVE },
        },
      }),
      prisma.roleDefinition.findUnique({
        where: { key: DEFAULT_REGISTER_ROLE_KEY },
      }),
    ]);
    if (!selectedCompany || !role) {
      redirect("/onboarding/companion?error=company_unavailable");
    }

    await prisma.companyMembership.upsert({
      where: { userId_companyId: { userId: targetUserId, companyId: selectedCompany.id } },
      create: {
        userId: targetUserId,
        companyId: selectedCompany.id,
        roleDefinitionId: role.id,
      },
      update: {
        roleDefinitionId: role.id,
      },
    });
    await ensureMemberOnboardingForCompany(targetUserId, selectedCompany.id);
    assignedCompanyId = selectedCompany.id;
  }

  const all = getCompanionManifest();
  const pool =
    actor.isSuperAdmin && (!editingSelf || locked)
      ? all
      : getCompanionManifestForUser(target as AccessUser);
  const allowed = new Set(pool.map((e) => e.species));
  if (!allowed.has(species)) throw new Error("Invalid companion species for this account");
  const manifestId = all.find((e) => e.species === species)?.id ?? null;
  const now = new Date();

  await prisma.companionProfile.upsert({
    where: { userId: targetUserId },
    create: {
      userId: targetUserId,
      species,
      companionManifestId: manifestId,
      name,
      mood: "CALM",
      level: 1,
      selectedAt: now,
    },
    update: { species, companionManifestId: manifestId, name, selectedAt: now },
  });
  if (!target.companionIntroCompletedAt) {
    await prisma.user.update({
      where: { id: targetUserId },
      data: { companionIntroCompletedAt: now },
    });
  }
  if (assignedCompanyId) {
    invalidatePermissionCache(targetUserId);
  }
  invalidateAccessUserCache(targetUserId, target.clerkId);
  revalidatePath("/home");
  revalidatePath("/onboarding");
  revalidatePath("/onboarding/member");
  revalidatePath("/staff");
  revalidatePath(`/staff/${targetUserId}`);
  revalidatePath("/onboarding/companion");
  revalidatePath("/settings/profile");
  if (assignedCompanyId) {
    revalidatePath(`/companies/${assignedCompanyId}`);
  }
  const next = String(formData.get("next") ?? "").trim();
  if (next === "home") redirect("/home");
}
