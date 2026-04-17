import type { Attachment, Company, CompanyOnboardingMaterial } from "@prisma/client";
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
  onboardingMaterials?: (CompanyOnboardingMaterial & {
    packageAttachment?: Pick<Attachment, "id" | "fileName" | "mimeType"> | null;
    videoAttachment?: Pick<Attachment, "id" | "fileName" | "mimeType"> | null;
  })[];
};

export type ResolvedCompanyOnboardingMaterial = CompanyOnboardingMaterial & {
  source: "db" | "legacy";
  isCurrent: boolean;
  packageHref: string;
  videoHref: string | null;
  packageAttachmentName: string | null;
  videoAttachmentName: string | null;
  videoMimeType: string | null;
};

type MaterialWithAttachments = CompanyOnboardingMaterial & {
  packageAttachment?: Pick<Attachment, "id" | "fileName" | "mimeType"> | null;
  videoAttachment?: Pick<Attachment, "id" | "fileName" | "mimeType"> | null;
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

export function attachmentHref(id: string) {
  return `/api/attachments/${id}`;
}

export function resolveMaterialMedia(material: {
  packageUrl: string;
  videoUrl: string | null;
  packageAttachmentId?: string | null;
  videoAttachmentId?: string | null;
  packageAttachment?: Pick<Attachment, "id" | "fileName" | "mimeType"> | null;
  videoAttachment?: Pick<Attachment, "id" | "fileName" | "mimeType"> | null;
}) {
  const packageHref = material.packageAttachmentId ? attachmentHref(material.packageAttachmentId) : material.packageUrl.trim();
  const videoHref = material.videoAttachmentId
    ? attachmentHref(material.videoAttachmentId)
    : (material.videoUrl?.trim() || null);
  return {
    packageHref,
    videoHref,
    packageAttachmentName: material.packageAttachment?.fileName ?? null,
    videoAttachmentName: material.videoAttachment?.fileName ?? null,
    videoMimeType: material.videoAttachment?.mimeType ?? null,
  };
}

export function isLegacyCompanyOnboardingMaterialId(materialId: string) {
  return materialId.startsWith(LEGACY_COMPANY_ONBOARDING_MATERIAL_ID_PREFIX);
}

export function resolveCompanyOnboardingMaterials(
  company: CompanyWithOnboardingMaterials,
): ResolvedCompanyOnboardingMaterial[] {
  const dbMaterials = sortMaterialsDesc(company.onboardingMaterials ?? []).filter(
    (material) => Boolean(material.packageAttachmentId || material.packageUrl.trim()),
  );
  if (dbMaterials.length) {
    return dbMaterials.map((material, index) => ({
      ...material,
      videoUrl: normalizeVideoUrl(material.videoUrl),
      packageVersion: normalizePackageVersion(material.packageVersion),
      ...resolveMaterialMedia(material as MaterialWithAttachments),
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
      packageAttachmentId: null,
      videoAttachmentId: null,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      packageHref: packageUrl,
      videoHref: normalizeVideoUrl(company.onboardingVideoUrl),
      packageAttachmentName: null,
      videoAttachmentName: null,
      videoMimeType: null,
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
        include: {
          packageAttachment: { select: { id: true, fileName: true, mimeType: true } },
          videoAttachment: { select: { id: true, fileName: true, mimeType: true } },
        },
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
