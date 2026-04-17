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
import { sanitizeFileName, storeUploadedFile } from "@/lib/file-storage";
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
    packageUrl: String(formData.get("onboardingPackageUrl") ?? "").trim(),
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

  const targetMaterial = await requireEditableOnboardingMaterial(user, companyId, materialId);
  const nextValues = parseCompanyOnboardingMaterial(formData);
  const currentPackageHref = targetMaterial.packageAttachmentId ? attachmentHref(targetMaterial.packageAttachmentId) : null;
  const currentVideoHref = targetMaterial.videoAttachmentId ? attachmentHref(targetMaterial.videoAttachmentId) : null;

  await prisma.companyOnboardingMaterial.update({
    where: { id: targetMaterial.id },
    data: {
      ...nextValues,
      packageAttachmentId: currentPackageHref && nextValues.packageUrl !== currentPackageHref ? null : targetMaterial.packageAttachmentId,
      videoAttachmentId:
        currentVideoHref && nextValues.videoUrl !== currentVideoHref ? null : targetMaterial.videoAttachmentId,
    },
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

  const file = formData.get("file");
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) throw new Error("Missing file");
  const mimeType = file.type || "application/octet-stream";
  if (acceptMimePrefix && !mimeType.startsWith(acceptMimePrefix)) {
    throw new Error(`Expected a ${acceptMimePrefix.replace("/", "")} file`);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const fileName = sanitizeFileName(file.name || "upload");
  const previousVersionId = kind === "package" ? material.packageAttachmentId : material.videoAttachmentId;
  const { storageKey, blobUrl } = await storeUploadedFile(buf, fileName, mimeType, `onboarding/${companyId}/${material.id}/${kind}`);

  const attachment = await prisma.attachment.create({
    data: {
      resourceKind: AttachmentResourceKind.FILE,
      previousVersionId,
      fileName,
      mimeType,
      sizeBytes: buf.length,
      storageKey,
      blobUrl,
      uploadedById: user.id,
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
