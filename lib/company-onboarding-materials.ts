import type { Company, CompanyOnboardingMaterial } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DEFAULT_COMPANY_ONBOARDING_VERSION = "v1";
export const DEFAULT_COMPANY_ONBOARDING_DEADLINE_DAYS = 14;
export const LEGACY_COMPANY_ONBOARDING_MATERIAL_ID_PREFIX = "legacy-company-onboarding-material:";

type CompanyWithOnboardingMaterials = Pick<
  Company,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "onboardingPackageUrl"
  | "onboardingVideoUrl"
  | "onboardingPackageVersion"
  | "onboardingDeadlineDays"
> & {
  onboardingMaterials?: CompanyOnboardingMaterial[];
};

export type ResolvedCompanyOnboardingMaterial = CompanyOnboardingMaterial & {
  source: "db" | "legacy";
  isCurrent: boolean;
};

function normalizePackageVersion(value: string | null | undefined) {
  return value?.trim() || DEFAULT_COMPANY_ONBOARDING_VERSION;
}

function normalizeVideoUrl(value: string | null | undefined) {
  return value?.trim() || null;
}

function sortMaterialsDesc(materials: CompanyOnboardingMaterial[]) {
  return [...materials].sort((a, b) => {
    if (b.createdAt.getTime() !== a.createdAt.getTime()) {
      return b.createdAt.getTime() - a.createdAt.getTime();
    }
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}

export function isLegacyCompanyOnboardingMaterialId(materialId: string) {
  return materialId.startsWith(LEGACY_COMPANY_ONBOARDING_MATERIAL_ID_PREFIX);
}

export function resolveCompanyOnboardingMaterials(
  company: CompanyWithOnboardingMaterials,
): ResolvedCompanyOnboardingMaterial[] {
  const dbMaterials = sortMaterialsDesc(company.onboardingMaterials ?? []);
  if (dbMaterials.length) {
    return dbMaterials.map((material, index) => ({
      ...material,
      videoUrl: normalizeVideoUrl(material.videoUrl),
      packageVersion: normalizePackageVersion(material.packageVersion),
      source: "db",
      isCurrent: index === 0,
    }));
  }

  const packageUrl = company.onboardingPackageUrl?.trim();
  if (!packageUrl) return [];

  return [
    {
      id: `${LEGACY_COMPANY_ONBOARDING_MATERIAL_ID_PREFIX}${company.id}`,
      companyId: company.id,
      packageUrl,
      videoUrl: normalizeVideoUrl(company.onboardingVideoUrl),
      packageVersion: normalizePackageVersion(company.onboardingPackageVersion),
      deadlineDays: company.onboardingDeadlineDays ?? DEFAULT_COMPANY_ONBOARDING_DEADLINE_DAYS,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      source: "legacy",
      isCurrent: true,
    },
  ];
}

export function getCurrentCompanyOnboardingMaterial(company: CompanyWithOnboardingMaterials) {
  return resolveCompanyOnboardingMaterials(company)[0] ?? null;
}

export async function migrateLegacyCompanyOnboardingMaterial(companyId: string) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
    include: {
      onboardingMaterials: {
        orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
        take: 1,
      },
    },
  });
  if (!company) throw new Error("Not found");

  if (company.onboardingMaterials.length) {
    return company.onboardingMaterials[0] ?? null;
  }

  const packageUrl = company.onboardingPackageUrl?.trim();
  if (!packageUrl) return null;

  const material = await prisma.companyOnboardingMaterial.create({
    data: {
      companyId,
      packageUrl,
      videoUrl: normalizeVideoUrl(company.onboardingVideoUrl),
      packageVersion: normalizePackageVersion(company.onboardingPackageVersion),
      deadlineDays: company.onboardingDeadlineDays ?? DEFAULT_COMPANY_ONBOARDING_DEADLINE_DAYS,
    },
  });

  await prisma.company.update({
    where: { id: companyId },
    data: {
      onboardingPackageUrl: null,
      onboardingVideoUrl: null,
    },
  });

  return material;
}
