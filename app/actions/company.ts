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
  getResolvedCompanyOnboardingMaterial,
  isLegacyCompanyOnboardingMaterialId,
  migrateLegacyCompanyOnboardingMaterial,
  serializeResolvedCompanyOnboardingMaterial,
} from "@/lib/company-onboarding-materials";
import { storeUploadedFile } from "@/lib/file-storage";
import { backfillMemberOnboardingsForCompany } from "@/lib/member-onboarding";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { deriveUploadedDisplayFileName, getDisplayFileNameStem, sanitizeDisplayFileName } from "@/lib/upload-file-name";

export type CompanyOnboardingMaterialMutationResult = {
  ok: boolean;
  error: string | null;
  material?: ReturnType<typeof serializeResolvedCompanyOnboardingMaterial> | null;
  deletedId?: string | null;
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
    title: sanitizeDisplayFileName(String(formData.get("onboardingMaterialTitle") ?? "")) || null,
    description: String(formData.get("onboardingMaterialDescription") ?? "").trim() || null,
    packageUrl: String(formData.get("onboardingPackageUrl") ?? "").trim(),
    videoUrl: String(formData.get("onboardingVideoUrl") ?? "").trim() || null,
    packageVersion: String(formData.get("onboardingPackageVersion") ?? "").trim() || DEFAULT_COMPANY_ONBOARDING_VERSION,
    deadlineDays: parseOnboardingDeadlineDays(formData.get("onboardingDeadlineDays")),
  };
}

function finalizeMaterialTitle(params: {
  title?: string | null;
  uploadedFileName?: string | null;
  fallbackTitle?: string | null;
}) {
  return (
    sanitizeDisplayFileName(params.title) ||
    (params.uploadedFileName ? getDisplayFileNameStem(params.uploadedFileName) || sanitizeDisplayFileName(params.uploadedFileName) : null) ||
    sanitizeDisplayFileName(params.fallbackTitle) ||
    null
  );
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
  const resolvedMaterialId = isLegacyCompanyOnboardingMaterialId(materialId)
    ? (await migrateLegacyCompanyOnboardingMaterial(companyId))?.id ?? null
    : materialId;
  const targetMaterial = resolvedMaterialId
    ? await prisma.companyOnboardingMaterial.findFirst({
        where: { id: resolvedMaterialId, companyId },
        include: {
          packageAttachment: { select: { id: true, fileName: true, mimeType: true } },
          videoAttachment: { select: { id: true, fileName: true, mimeType: true } },
        },
      })
    : null;

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

async function renameMaterialAttachments(params: {
  material: Awaited<ReturnType<typeof requireEditableOnboardingMaterial>>;
  title: string | null;
}) {
  if (!params.title) return;

  const updates: Promise<unknown>[] = [];
  if (params.material.packageAttachmentId) {
    const nextFileName = deriveUploadedDisplayFileName({
      label: params.title,
      originalFileName: params.material.packageAttachment?.fileName || "upload",
      fallbackBaseName: "upload",
    });
    if (nextFileName !== params.material.packageAttachment?.fileName) {
      updates.push(
        prisma.attachment.update({
          where: { id: params.material.packageAttachmentId },
          data: { fileName: nextFileName },
        }),
      );
    }
  }
  if (params.material.videoAttachmentId) {
    const nextFileName = deriveUploadedDisplayFileName({
      label: params.title,
      originalFileName: params.material.videoAttachment?.fileName || "upload",
      fallbackBaseName: "upload",
    });
    if (nextFileName !== params.material.videoAttachment?.fileName) {
      updates.push(
        prisma.attachment.update({
          where: { id: params.material.videoAttachmentId },
          data: { fileName: nextFileName },
        }),
      );
    }
  }

  if (updates.length) {
    await Promise.all(updates);
  }
}

async function createCompanyOnboardingMaterialMutation(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.update");
  const companyId = requireString(formData, "companyId");
  await requireCompanyForUpdate(user, companyId);
  await migrateLegacyCompanyOnboardingMaterial(companyId);

  const values = parseCompanyOnboardingMaterial(formData);
  const packageUpload = await parsePendingUpload(formData, "onboardingPackageFile", "onboardingMaterialTitle");

  if (
    !hasAnyOnboardingMaterialSource({
      packageUrl: values.packageUrl,
      videoUrl: values.videoUrl,
      packageUploadCount: packageUpload ? 1 : 0,
    })
  ) {
    throw new Error("Provide a material URL, onboarding video URL, or upload a material file.");
  }

  const material = await prisma.companyOnboardingMaterial.create({
    data: {
      companyId,
      title: finalizeMaterialTitle({ title: values.title, uploadedFileName: packageUpload?.fileName }),
      description: values.description,
      packageUrl: packageUpload ? "" : values.packageUrl,
      videoUrl: values.videoUrl,
      packageVersion: values.packageVersion,
      deadlineDays: values.deadlineDays,
    },
  });

  if (packageUpload) {
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

  await backfillMemberOnboardingsForCompany(companyId);
  revalidateCompanyPaths(companyId);

  const resolvedMaterial = await getResolvedCompanyOnboardingMaterial(companyId, material.id);
  if (!resolvedMaterial) throw new Error("Unable to load the saved onboarding material.");
  return resolvedMaterial;
}

function toCompanyOnboardingMaterialError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to save the uploaded onboarding file.";
}

export async function createCompanyOnboardingMaterialAction(
  formData: FormData,
): Promise<CompanyOnboardingMaterialMutationResult> {
  try {
    const material = await createCompanyOnboardingMaterialMutation(formData);
    return { ok: true, error: null, material: serializeResolvedCompanyOnboardingMaterial(material) };
  } catch (error) {
    return { ok: false, error: toCompanyOnboardingMaterialError(error), material: null };
  }
}

export async function updateCompanyOnboardingMaterialAction(
  formData: FormData,
): Promise<CompanyOnboardingMaterialMutationResult> {
  try {
    const user = (await requireUser()) as AccessUser;
    await assertPermission(user, "company.update");
    const companyId = requireString(formData, "companyId");
    const materialId = requireString(formData, "materialId");
    await requireCompanyForUpdate(user, companyId);

    const targetMaterial = await requireEditableOnboardingMaterial(user, companyId, materialId);
    const nextValues = parseCompanyOnboardingMaterial(formData);
    const packageUpload = await parsePendingUpload(formData, "onboardingPackageFile", "onboardingMaterialTitle");
    const currentPackageHref = targetMaterial.packageAttachmentId ? attachmentHref(targetMaterial.packageAttachmentId) : null;
    const currentVideoHref = targetMaterial.videoAttachmentId ? attachmentHref(targetMaterial.videoAttachmentId) : null;
    const keepsPackageAttachment = Boolean(!packageUpload && currentPackageHref && nextValues.packageUrl === currentPackageHref);
    const keepsVideoAttachment = Boolean(currentVideoHref && nextValues.videoUrl === currentVideoHref);

    if (
      !hasAnyOnboardingMaterialSource({
        packageUrl: nextValues.packageUrl,
        videoUrl: nextValues.videoUrl,
        packageUploadCount: packageUpload ? 1 : 0,
        keepsPackageAttachment,
        keepsVideoAttachment,
      })
    ) {
      throw new Error("Provide a material URL, onboarding video URL, or upload a material file.");
    }

    const nextTitle = finalizeMaterialTitle({
      title: nextValues.title,
      uploadedFileName: packageUpload?.fileName,
      fallbackTitle: targetMaterial.title || targetMaterial.packageAttachment?.fileName || targetMaterial.videoAttachment?.fileName,
    });

    await prisma.companyOnboardingMaterial.update({
      where: { id: targetMaterial.id },
      data: {
        title: nextTitle,
        description: nextValues.description,
        packageUrl: packageUpload ? "" : nextValues.packageUrl,
        videoUrl: nextValues.videoUrl,
        packageVersion: nextValues.packageVersion,
        deadlineDays: nextValues.deadlineDays,
        packageAttachmentId:
          packageUpload || (currentPackageHref && nextValues.packageUrl !== currentPackageHref)
            ? packageUpload
              ? targetMaterial.packageAttachmentId
              : null
            : targetMaterial.packageAttachmentId,
        videoAttachmentId:
          currentVideoHref && nextValues.videoUrl !== currentVideoHref ? null : targetMaterial.videoAttachmentId,
      },
    });

    if (packageUpload) {
      await uploadOnboardingMaterialBlob({
        userId: user.id,
        companyId,
        materialId: targetMaterial.id,
        kind: "package",
        file: packageUpload,
      });
    } else {
      await renameMaterialAttachments({
        material: targetMaterial,
        title: nextTitle,
      });
    }

    await backfillMemberOnboardingsForCompany(companyId);
    revalidateCompanyPaths(companyId);

    const resolvedMaterial = await getResolvedCompanyOnboardingMaterial(companyId, targetMaterial.id);
    if (!resolvedMaterial) throw new Error("Unable to load the saved onboarding material.");
    return { ok: true, error: null, material: serializeResolvedCompanyOnboardingMaterial(resolvedMaterial) };
  } catch (error) {
    return { ok: false, error: toCompanyOnboardingMaterialError(error), material: null };
  }
}

export async function deleteCompanyOnboardingMaterialAction(
  formData: FormData,
): Promise<CompanyOnboardingMaterialMutationResult> {
  try {
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
    return { ok: true, error: null, deletedId: materialId, material: null };
  } catch (error) {
    return { ok: false, error: toCompanyOnboardingMaterialError(error), deletedId: null, material: null };
  }
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
  const material = await requireEditableOnboardingMaterial(user, companyId, materialId);

  const upload = await parsePendingUpload(formData, "file", "onboardingMaterialTitle", acceptMimePrefix);
  if (!upload) throw new Error("Missing file");

  await uploadOnboardingMaterialBlob({
    userId: user.id,
    companyId,
    materialId,
    kind,
    file: upload,
  });

  await prisma.companyOnboardingMaterial.update({
    where: { id: material.id },
    data: {
      title: finalizeMaterialTitle({
        title: String(formData.get("onboardingMaterialTitle") ?? ""),
        uploadedFileName: upload.fileName,
        fallbackTitle: material.title || material.packageAttachment?.fileName || material.videoAttachment?.fileName,
      }),
    },
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
