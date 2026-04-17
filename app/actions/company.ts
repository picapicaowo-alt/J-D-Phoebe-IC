"use server";

import { revalidatePath } from "next/cache";
import { CompanyStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import {
  DEFAULT_COMPANY_ONBOARDING_DEADLINE_DAYS,
  DEFAULT_COMPANY_ONBOARDING_VERSION,
  isLegacyCompanyOnboardingMaterialId,
  migrateLegacyCompanyOnboardingMaterial,
} from "@/lib/company-onboarding-materials";
import { backfillMemberOnboardingsForCompany } from "@/lib/member-onboarding";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

function parseOnboardingDeadlineDays(raw: FormDataEntryValue | null) {
  return Math.max(
    1,
    Math.min(365, Number(raw ?? DEFAULT_COMPANY_ONBOARDING_DEADLINE_DAYS) || DEFAULT_COMPANY_ONBOARDING_DEADLINE_DAYS),
  );
}

function parseCompanyOnboardingMaterial(formData: FormData) {
  return {
    packageUrl: requireString(formData, "onboardingPackageUrl"),
    videoUrl: String(formData.get("onboardingVideoUrl") ?? "").trim() || null,
    packageVersion: String(formData.get("onboardingPackageVersion") ?? "").trim() || DEFAULT_COMPANY_ONBOARDING_VERSION,
    deadlineDays: parseOnboardingDeadlineDays(formData.get("onboardingDeadlineDays")),
  };
}

async function requireCompanyForUpdate(actor: AccessUser, companyId: string) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
    include: {
      onboardingMaterials: {
        orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
      },
    },
  });
  if (!company) throw new Error("Not found");
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, company.orgGroupId) && !isCompanyAdmin(actor, companyId)) {
    throw new Error("Forbidden");
  }
  return company;
}

function revalidateCompanyPaths(companyId: string) {
  revalidatePath("/onboarding");
  revalidatePath("/onboarding/member");
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/group");
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
  const company = await requireCompanyForUpdate(user, companyId);

  const name = requireString(formData, "name");
  const companyType = String(formData.get("companyType") ?? "").trim() || null;
  const introduction = String(formData.get("introduction") ?? "").trim() || null;
  const status = requireString(formData, "status") as CompanyStatus;

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
    },
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/group");
}

export async function createCompanyOnboardingMaterialAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.update");
  const companyId = requireString(formData, "companyId");
  await requireCompanyForUpdate(user, companyId);
  await migrateLegacyCompanyOnboardingMaterial(companyId);

  await prisma.companyOnboardingMaterial.create({
    data: {
      companyId,
      ...parseCompanyOnboardingMaterial(formData),
    },
  });

  await backfillMemberOnboardingsForCompany(companyId);
  revalidateCompanyPaths(companyId);
}

export async function updateCompanyOnboardingMaterialAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.update");
  const companyId = requireString(formData, "companyId");
  const materialId = requireString(formData, "materialId");
  await requireCompanyForUpdate(user, companyId);

  const targetMaterial = isLegacyCompanyOnboardingMaterialId(materialId)
    ? await migrateLegacyCompanyOnboardingMaterial(companyId)
    : await prisma.companyOnboardingMaterial.findFirst({
        where: { id: materialId, companyId },
      });

  if (!targetMaterial) {
    throw new Error("Not found");
  }

  await prisma.companyOnboardingMaterial.update({
    where: { id: targetMaterial.id },
    data: parseCompanyOnboardingMaterial(formData),
  });

  await backfillMemberOnboardingsForCompany(companyId);
  revalidateCompanyPaths(companyId);
}

export async function deleteCompanyOnboardingMaterialAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.update");
  const companyId = requireString(formData, "companyId");
  const materialId = requireString(formData, "materialId");
  await requireCompanyForUpdate(user, companyId);

  if (isLegacyCompanyOnboardingMaterialId(materialId)) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        onboardingPackageUrl: null,
        onboardingVideoUrl: null,
      },
    });
  } else {
    const material = await prisma.companyOnboardingMaterial.findFirst({
      where: { id: materialId, companyId },
      select: { id: true },
    });
    if (!material) throw new Error("Not found");

    await prisma.companyOnboardingMaterial.delete({
      where: { id: material.id },
    });
  }

  revalidateCompanyPaths(companyId);
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
