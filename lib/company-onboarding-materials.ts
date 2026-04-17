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
  displayName: string;
  displayDescription: string | null;
};

export type SerializedResolvedCompanyOnboardingMaterial = Omit<
  ResolvedCompanyOnboardingMaterial,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
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

function normalizeMaterialText(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  return trimmed || null;
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

function labelFromUrl(rawUrl: string | null | undefined) {
  const value = rawUrl?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const lastPart = pathParts.at(-1);
    if (lastPart && lastPart !== "view") return decodeURIComponent(lastPart);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
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

export function resolveMaterialDisplayName(material: {
  title?: string | null;
  packageUrl: string;
  videoUrl?: string | null;
  packageAttachment?: Pick<Attachment, "fileName"> | null;
  videoAttachment?: Pick<Attachment, "fileName"> | null;
}) {
  return (
    normalizeMaterialText(material.title) ||
    material.packageAttachment?.fileName ||
    material.videoAttachment?.fileName ||
    labelFromUrl(material.packageUrl) ||
    labelFromUrl(material.videoUrl) ||
    "Onboarding material"
  );
}

export function resolveMaterialDescription(material: { description?: string | null }) {
  return normalizeMaterialText(material.description);
}

function hasAnyMaterialContent(material: {
  packageAttachmentId?: string | null;
  packageUrl: string;
  videoAttachmentId?: string | null;
  videoUrl?: string | null;
}) {
  return Boolean(
    material.packageAttachmentId ||
      material.packageUrl.trim() ||
      material.videoAttachmentId ||
      material.videoUrl?.trim(),
  );
}

function toResolvedMaterial(
  material: MaterialWithAttachments,
  source: "db" | "legacy",
  isCurrent: boolean,
): ResolvedCompanyOnboardingMaterial {
  return {
    ...material,
    title: normalizeMaterialText(material.title),
    description: normalizeMaterialText(material.description),
    videoUrl: normalizeVideoUrl(material.videoUrl),
    packageVersion: normalizePackageVersion(material.packageVersion),
    ...resolveMaterialMedia(material),
    displayName: resolveMaterialDisplayName(material),
    displayDescription: resolveMaterialDescription(material),
    source,
    isCurrent,
  };
}

export function serializeResolvedCompanyOnboardingMaterial(
  material: ResolvedCompanyOnboardingMaterial,
): SerializedResolvedCompanyOnboardingMaterial {
  return {
    ...material,
    createdAt: material.createdAt.toISOString(),
    updatedAt: material.updatedAt.toISOString(),
  };
}

export function deserializeResolvedCompanyOnboardingMaterial(
  material: SerializedResolvedCompanyOnboardingMaterial,
): ResolvedCompanyOnboardingMaterial {
  return {
    ...material,
    createdAt: new Date(material.createdAt),
    updatedAt: new Date(material.updatedAt),
  };
}

export function isLegacyCompanyOnboardingMaterialId(materialId: string) {
  return materialId.startsWith(LEGACY_COMPANY_ONBOARDING_MATERIAL_ID_PREFIX);
}

export function resolveCompanyOnboardingMaterials(
  company: CompanyWithOnboardingMaterials,
): ResolvedCompanyOnboardingMaterial[] {
  const dbMaterials = sortMaterialsDesc(company.onboardingMaterials ?? []).filter(hasAnyMaterialContent);
  if (dbMaterials.length) {
    return dbMaterials.map((material, index) => toResolvedMaterial(material as MaterialWithAttachments, "db", index === 0));
  }

  const packageUrl = company.onboardingPackageUrl?.trim() ?? "";
  const videoUrl = normalizeVideoUrl(company.onboardingVideoUrl);
  if (!packageUrl && !videoUrl) return [];

  return [
    toResolvedMaterial(
      {
        id: `${LEGACY_COMPANY_ONBOARDING_MATERIAL_ID_PREFIX}${company.id}`,
        companyId: company.id,
        title: null,
        description: null,
        packageUrl,
        videoUrl,
        packageVersion: normalizePackageVersion(company.onboardingPackageVersion),
        deadlineDays: company.onboardingDeadlineDays ?? DEFAULT_COMPANY_ONBOARDING_DEADLINE_DAYS,
        packageAttachmentId: null,
        videoAttachmentId: null,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
      "legacy",
      true,
    ),
  ];
}

export function getCurrentCompanyOnboardingMaterial(company: CompanyWithOnboardingMaterials) {
  return resolveCompanyOnboardingMaterials(company)[0] ?? null;
}

export async function getResolvedCompanyOnboardingMaterial(companyId: string, materialId: string) {
  const material = await prisma.companyOnboardingMaterial.findFirst({
    where: { id: materialId, companyId },
    include: {
      packageAttachment: { select: { id: true, fileName: true, mimeType: true } },
      videoAttachment: { select: { id: true, fileName: true, mimeType: true } },
    },
  });
  if (!material) return null;
  return toResolvedMaterial(material, "db", false);
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

  const packageUrl = company.onboardingPackageUrl?.trim() ?? "";
  const videoUrl = normalizeVideoUrl(company.onboardingVideoUrl);
  if (!packageUrl && !videoUrl) return null;

  const material = await prisma.companyOnboardingMaterial.create({
    data: {
      companyId,
      packageUrl,
      videoUrl,
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
