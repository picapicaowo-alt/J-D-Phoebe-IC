"use server";

import { revalidatePath } from "next/cache";
import { AttachmentResourceKind, CompanyStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import {
  DEFAULT_COMPANY_ONBOARDING_DEADLINE_DAYS,
  DEFAULT_COMPANY_ONBOARDING_VERSION,
  attachmentHref,
  isLegacyCompanyOnboardingMaterialId,
  migrateLegacyCompanyOnboardingMaterial,
} from "@/lib/company-onboarding-materials";
import { storeUploadedFile } from "@/lib/file-storage";
import { backfillMemberOnboardingsForCompany } from "@/lib/member-onboarding";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { deriveUploadedDisplayFileName, sanitizeDisplayFileName } from "@/lib/upload-file-name";

export type CompanyOnboardingMaterialActionResult = {
  ok: boolean;
  error: string | null;
};

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

function hasAnyOnboardingMaterialSource(params: {
  packageUrl?: string | null;
  videoUrl?: string | null;
  packageUploadCount?: number;
  keepsPackageAttachment?: boolean;
  keepsVideoAttachment?: boolean;
}) {
  return Boolean(
    params.packageUrl?.trim() ||
      params.videoUrl?.trim() ||
      (params.packageUploadCount ?? 0) > 0 ||
      params.keepsPackageAttachment ||
      params.keepsVideoAttachment,
  );
}

function parseCompanyOnboardingMaterial(formData: FormData) {
  return {
    packageUrl: String(formData.get("onboardingPackageUrl") ?? "").trim(),
    videoUrl: String(formData.get("onboardingVideoUrl") ?? "").trim() || null,
    packageVersion: String(formData.get("onboardingPackageVersion") ?? "").trim() || DEFAULT_COMPANY_ONBOARDING_VERSION,
    deadlineDays: parseOnboardingDeadlineDays(formData.get("onboardingDeadlineDays")),
    packageFileName: sanitizeDisplayFileName(String(formData.get("onboardingPackageFileName") ?? "")) || null,
  };
}

function isFormDataFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && "arrayBuffer" in value);
}

type PendingUpload = {
  buf: Buffer;
  fileName: string;
  mimeType: string;
};

async function parsePendingUpload(
  formData: FormData,
  key: string,
  fileNameKey: string,
  acceptMimePrefix?: string,
): Promise<PendingUpload | null> {
  const value = formData.get(key);
  if (!isFormDataFile(value) || value.size <= 0) return null;
  const mimeType = value.type || "application/octet-stream";
  if (acceptMimePrefix && !mimeType.startsWith(acceptMimePrefix)) {
    throw new Error(`Expected a ${acceptMimePrefix.replace("/", "")} file`);
  }
  const requestedFileName = String(formData.get(fileNameKey) ?? "").trim();
  return {
    buf: Buffer.from(await value.arrayBuffer()),
    fileName: deriveUploadedDisplayFileName({
      label: requestedFileName,
      originalFileName: value.name || "upload",
      fallbackBaseName: "upload",
    }),
    mimeType,
  };
}

async function parsePendingUploads(formData: FormData, key: string, fileNameKey: string): Promise<PendingUpload[]> {
  const requestedFileName = String(formData.get(fileNameKey) ?? "").trim();
  const values = formData.getAll(key);
  const uploadableValues = values.filter((value): value is File => isFormDataFile(value) && value.size > 0);
  const uploads: PendingUpload[] = [];
  for (const value of uploadableValues) {
    uploads.push({
      buf: Buffer.from(await value.arrayBuffer()),
      fileName: deriveUploadedDisplayFileName({
        label: uploadableValues.length === 1 ? requestedFileName : "",
        originalFileName: value.name || "upload",
        fallbackBaseName: "upload",
      }),
      mimeType: value.type || "application/octet-stream",
    });
  }
  return uploads;
}

async function requireCompanyForUpdate(actor: AccessUser, companyId: string) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
    include: {
      onboardingMaterials: {
        orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
        include: {
          packageAttachment: { select: { id: true, fileName: true, mimeType: true } },
          videoAttachment: { select: { id: true, fileName: true, mimeType: true } },
        },
      },
    },
  });
  if (!company) throw new Error("Not found");
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, company.orgGroupId) && !isCompanyAdmin(actor, companyId)) {
    throw new Error("Forbidden");
  }
  return company;
}

async function requireEditableOnboardingMaterial(actor: AccessUser, companyId: string, materialId: string) {
  await requireCompanyForUpdate(actor, companyId);
  const targetMaterial = isLegacyCompanyOnboardingMaterialId(materialId)
    ? await migrateLegacyCompanyOnboardingMaterial(companyId)
    : await prisma.companyOnboardingMaterial.findFirst({
        where: { id: materialId, companyId },
        include: {
          packageAttachment: { select: { id: true, fileName: true, mimeType: true } },
          videoAttachment: { select: { id: true, fileName: true, mimeType: true } },
        },
      });

  if (!targetMaterial) throw new Error("Not found");
  return targetMaterial;
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

async function createCompanyOnboardingMaterialMutation(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.update");
  const companyId = requireString(formData, "companyId");
  await requireCompanyForUpdate(user, companyId);
  await migrateLegacyCompanyOnboardingMaterial(companyId);

  const values = parseCompanyOnboardingMaterial(formData);
  const materialValues = {
    packageUrl: values.packageUrl,
    videoUrl: values.videoUrl,
    packageVersion: values.packageVersion,
    deadlineDays: values.deadlineDays,
  };
  const packageUploads = await parsePendingUploads(formData, "onboardingPackageFiles", "onboardingPackageFileName");

  if (
    !hasAnyOnboardingMaterialSource({
      packageUrl: materialValues.packageUrl,
      videoUrl: materialValues.videoUrl,
      packageUploadCount: packageUploads.length,
    })
  ) {
    throw new Error("Provide a material URL, onboarding video URL, or upload a material file.");
  }

  if (packageUploads.length > 0) {
    for (const packageUpload of packageUploads) {
      const material = await prisma.companyOnboardingMaterial.create({
        data: {
          companyId,
          packageUrl: "",
          videoUrl: null,
          packageVersion: materialValues.packageVersion,
          deadlineDays: materialValues.deadlineDays,
        },
      });

      try {
        await uploadOnboardingMaterialBlob({
          userId: user.id,
          companyId,
          materialId: material.id,
          kind: "package",
          file: packageUpload,
        });
      } catch (error) {
        await prisma.companyOnboardingMaterial.delete({
          where: { id: material.id },
        }).catch(() => undefined);

        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : "Unable to save the uploaded onboarding file.";
        throw new Error(message);
      }
    }
  } else {
    await prisma.companyOnboardingMaterial.create({
      data: {
        companyId,
        ...materialValues,
      },
    });
  }

  await backfillMemberOnboardingsForCompany(companyId);
  revalidateCompanyPaths(companyId);
}

function toCompanyOnboardingMaterialError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to save the uploaded onboarding file.";
}

export async function createCompanyOnboardingMaterialAction(
  _prevState: CompanyOnboardingMaterialActionResult | null,
  formData: FormData,
): Promise<CompanyOnboardingMaterialActionResult> {
  try {
    await createCompanyOnboardingMaterialMutation(formData);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: toCompanyOnboardingMaterialError(error) };
  }
}

export async function updateCompanyOnboardingMaterialAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.update");
  const companyId = requireString(formData, "companyId");
  const materialId = requireString(formData, "materialId");
  await requireCompanyForUpdate(user, companyId);

  const targetMaterial = await requireEditableOnboardingMaterial(user, companyId, materialId);
  const nextValues = parseCompanyOnboardingMaterial(formData);
  const { packageFileName, ...materialValues } = nextValues;
  const currentPackageHref = targetMaterial.packageAttachmentId ? attachmentHref(targetMaterial.packageAttachmentId) : null;
  const currentVideoHref = targetMaterial.videoAttachmentId ? attachmentHref(targetMaterial.videoAttachmentId) : null;
  const keepsPackageAttachment = Boolean(currentPackageHref && materialValues.packageUrl === currentPackageHref);
  const keepsVideoAttachment = Boolean(currentVideoHref && materialValues.videoUrl === currentVideoHref);

  if (
    !hasAnyOnboardingMaterialSource({
      packageUrl: materialValues.packageUrl,
      videoUrl: materialValues.videoUrl,
      keepsPackageAttachment,
      keepsVideoAttachment,
    })
  ) {
    throw new Error("Provide a material URL, onboarding video URL, or upload a material file.");
  }

  await prisma.companyOnboardingMaterial.update({
    where: { id: targetMaterial.id },
    data: {
      ...materialValues,
      packageAttachmentId: currentPackageHref && materialValues.packageUrl !== currentPackageHref ? null : targetMaterial.packageAttachmentId,
      videoAttachmentId:
        currentVideoHref && materialValues.videoUrl !== currentVideoHref ? null : targetMaterial.videoAttachmentId,
    },
  });

  if (targetMaterial.packageAttachmentId && packageFileName) {
    const currentPackageAttachment = await prisma.attachment.findFirst({
      where: { id: targetMaterial.packageAttachmentId, deletedAt: null },
      select: { fileName: true },
    });
    const nextAttachmentFileName = deriveUploadedDisplayFileName({
      label: packageFileName,
      originalFileName: currentPackageAttachment?.fileName || "upload",
      fallbackBaseName: "upload",
    });
    if (nextAttachmentFileName !== currentPackageAttachment?.fileName) {
      await prisma.attachment.update({
        where: { id: targetMaterial.packageAttachmentId },
        data: { fileName: nextAttachmentFileName },
      });
    }
  }

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
      select: { id: true, packageAttachmentId: true, videoAttachmentId: true },
    });
    if (!material) throw new Error("Not found");

    const attachmentIds = [material.packageAttachmentId, material.videoAttachmentId].filter(Boolean) as string[];
    if (attachmentIds.length) {
      await prisma.attachment.updateMany({
        where: { id: { in: attachmentIds }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }

    await prisma.companyOnboardingMaterial.delete({
      where: { id: material.id },
    });
  }

  revalidateCompanyPaths(companyId);
}

async function uploadOnboardingMaterialBlob({
  userId,
  companyId,
  materialId,
  kind,
  file,
}: {
  userId: string;
  companyId: string;
  materialId: string;
  kind: "package" | "video";
  file: PendingUpload;
}) {
  const material = await prisma.companyOnboardingMaterial.findFirst({
    where: { id: materialId, companyId },
    select: { id: true, packageAttachmentId: true, videoAttachmentId: true },
  });
  if (!material) throw new Error("Not found");

  const previousVersionId = kind === "package" ? material.packageAttachmentId : material.videoAttachmentId;
  const { storageKey, blobUrl } = await storeUploadedFile(
    file.buf,
    file.fileName,
    file.mimeType,
    `onboarding/${companyId}/${material.id}/${kind}`,
  );

  const attachment = await prisma.attachment.create({
    data: {
      resourceKind: AttachmentResourceKind.FILE,
      previousVersionId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.buf.length,
      storageKey,
      blobUrl,
      uploadedById: userId,
      description: kind === "package" ? "Onboarding package upload" : "Onboarding video upload",
    },
  });

  await prisma.companyOnboardingMaterial.update({
    where: { id: material.id },
    data:
      kind === "package"
        ? {
            packageAttachmentId: attachment.id,
            packageUrl: attachmentHref(attachment.id),
          }
        : {
            videoAttachmentId: attachment.id,
            videoUrl: attachmentHref(attachment.id),
    },
  });
}

async function uploadOnboardingMaterialFile(
  formData: FormData,
  kind: "package" | "video",
  acceptMimePrefix?: string,
) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.update");
  const companyId = requireString(formData, "companyId");
  const materialId = requireString(formData, "materialId");
  await requireEditableOnboardingMaterial(user, companyId, materialId);

  const upload = await parsePendingUpload(formData, "file", "onboardingPackageFileName", acceptMimePrefix);
  if (!upload) throw new Error("Missing file");

  await uploadOnboardingMaterialBlob({
    userId: user.id,
    companyId,
    materialId,
    kind,
    file: upload,
  });

  await backfillMemberOnboardingsForCompany(companyId);
  revalidateCompanyPaths(companyId);
}

export async function uploadCompanyOnboardingPackageAction(formData: FormData) {
  await uploadOnboardingMaterialFile(formData, "package");
}

export async function uploadCompanyOnboardingVideoAction(formData: FormData) {
  await uploadOnboardingMaterialFile(formData, "video", "video/");
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
