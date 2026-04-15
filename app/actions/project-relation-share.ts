"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canManageProject, type AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

function req(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

async function loadRelationForShare(relationId: string) {
  return prisma.projectRelation.findUnique({
    where: { id: relationId },
    include: { fromProject: { include: { company: true } }, toProject: { include: { company: true } } },
  });
}

function canManageEitherEnd(user: AccessUser, rel: NonNullable<Awaited<ReturnType<typeof loadRelationForShare>>>) {
  return canManageProject(user, rel.fromProject) || canManageProject(user, rel.toProject);
}

export async function toggleProjectRelationShareKnowledgeAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const relationId = req(formData, "relationId");
  const knowledgeAssetId = req(formData, "knowledgeAssetId");

  const rel = await loadRelationForShare(relationId);
  if (!rel) throw new Error("Relation not found");
  if (!canManageEitherEnd(user, rel)) throw new Error("Forbidden");

  const asset = await prisma.knowledgeAsset.findFirst({
    where: { id: knowledgeAssetId, deletedAt: null },
  });
  if (!asset?.projectId) throw new Error("Knowledge not found");
  if (asset.projectId !== rel.fromProjectId && asset.projectId !== rel.toProjectId) {
    throw new Error("Asset must belong to one of the linked projects.");
  }

  const existing = await prisma.projectRelationSharedKnowledge.findUnique({
    where: { relationId_knowledgeAssetId: { relationId, knowledgeAssetId } },
  });
  if (existing) {
    await prisma.projectRelationSharedKnowledge.delete({ where: { id: existing.id } });
  } else {
    await prisma.projectRelationSharedKnowledge.create({
      data: { relationId, knowledgeAssetId },
    });
  }

  revalidatePath(`/projects/${rel.fromProjectId}`);
  revalidatePath(`/projects/${rel.toProjectId}`);
  revalidatePath("/projects");
}

export async function toggleProjectRelationShareAttachmentAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const relationId = req(formData, "relationId");
  const attachmentId = req(formData, "attachmentId");

  const rel = await loadRelationForShare(relationId);
  if (!rel) throw new Error("Relation not found");
  if (!canManageEitherEnd(user, rel)) throw new Error("Forbidden");

  const att = await prisma.attachment.findFirst({
    where: { id: attachmentId, deletedAt: null, projectId: { not: null } },
  });
  if (!att?.projectId) throw new Error("Attachment not found");
  if (att.projectId !== rel.fromProjectId && att.projectId !== rel.toProjectId) {
    throw new Error("Attachment must belong to one of the linked projects.");
  }

  const existing = await prisma.projectRelationSharedAttachment.findUnique({
    where: { relationId_attachmentId: { relationId, attachmentId } },
  });
  if (existing) {
    await prisma.projectRelationSharedAttachment.delete({ where: { id: existing.id } });
  } else {
    await prisma.projectRelationSharedAttachment.create({
      data: { relationId, attachmentId },
    });
  }

  revalidatePath(`/projects/${rel.fromProjectId}`);
  revalidatePath(`/projects/${rel.toProjectId}`);
  revalidatePath("/projects");
}
