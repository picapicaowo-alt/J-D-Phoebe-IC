"use server";

import { revalidatePath } from "next/cache";
import { CompanyStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function createCompanyAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.create");
  const orgGroupId = requireString(formData, "orgGroupId");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, orgGroupId)) throw new Error("Forbidden");

  const name = requireString(formData, "name");
  const companyType = String(formData.get("companyType") ?? "").trim() || null;
  const introduction = String(formData.get("introduction") ?? "").trim() || null;

  const c = await prisma.company.create({
    data: { orgGroupId, name, companyType, introduction, status: CompanyStatus.ACTIVE },
  });
  await writeAudit({
    actorId: user.id,
    entityType: "COMPANY",
    entityId: c.id,
    action: "CREATE",
    newValue: name,
  });
  revalidatePath("/companies");
  revalidatePath("/group");
}

export async function updateCompanyAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.update");
  const companyId = requireString(formData, "companyId");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, company.orgGroupId) && !isCompanyAdmin(user, companyId)) {
    throw new Error("Forbidden");
  }

  const name = requireString(formData, "name");
  const companyType = String(formData.get("companyType") ?? "").trim() || null;
  const introduction = String(formData.get("introduction") ?? "").trim() || null;
  const status = requireString(formData, "status") as CompanyStatus;
  const onboardingPackageUrl = String(formData.get("onboardingPackageUrl") ?? "").trim() || null;
  const onboardingVideoUrl = String(formData.get("onboardingVideoUrl") ?? "").trim() || null;
  const onboardingPackageVersion = String(formData.get("onboardingPackageVersion") ?? "").trim() || "v1";
  const onboardingDeadlineDays = Math.max(1, Math.min(365, Number(formData.get("onboardingDeadlineDays") ?? 14) || 14));
  const prevPackageUrl = company.onboardingPackageUrl;

  if (name !== company.name) {
    await writeAudit({
      actorId: user.id,
      entityType: "COMPANY",
      entityId: companyId,
      action: "RENAME",
      field: "name",
      oldValue: company.name,
      newValue: name,
    });
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      name,
      companyType,
      introduction,
      status,
      onboardingPackageUrl: onboardingPackageUrl,
      onboardingVideoUrl,
      onboardingPackageVersion,
      onboardingDeadlineDays,
    },
  });
  if (onboardingPackageUrl && onboardingPackageUrl !== prevPackageUrl) {
    const { backfillMemberOnboardingsForCompany } = await import("@/lib/member-onboarding");
    await backfillMemberOnboardingsForCompany(companyId);
  }
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/group");
}

export async function archiveCompanyAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.archive");
  const companyId = requireString(formData, "companyId");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, company.orgGroupId)) throw new Error("Forbidden");

  await prisma.company.update({
    where: { id: companyId },
    data: { status: CompanyStatus.ARCHIVED, archivedAt: new Date() },
  });
  await writeAudit({ actorId: user.id, entityType: "COMPANY", entityId: companyId, action: "ARCHIVE" });
  revalidatePath("/companies");
  revalidatePath("/group");
}

export async function restoreCompanyAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.restore");
  const companyId = requireString(formData, "companyId");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, company.orgGroupId)) throw new Error("Forbidden");

  await prisma.company.update({
    where: { id: companyId },
    data: { status: CompanyStatus.ACTIVE, archivedAt: null },
  });
  await writeAudit({ actorId: user.id, entityType: "COMPANY", entityId: companyId, action: "RESTORE" });
  revalidatePath("/companies");
  revalidatePath("/group");
}
