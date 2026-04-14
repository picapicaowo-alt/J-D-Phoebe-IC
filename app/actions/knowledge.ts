"use server";

import { revalidatePath } from "next/cache";
import { KnowledgeLayer } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

function req(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function createKnowledgeAssetAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "knowledge.create");

  const title = req(formData, "title");
  const content = req(formData, "content");
  const layer = req(formData, "layer") as KnowledgeLayer;
  const projectIdRaw = String(formData.get("projectId") ?? "").trim();
  const projectId = projectIdRaw || null;
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const tags = String(formData.get("tags") ?? "").trim() || null;
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim() || null;

  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!p) throw new Error("Project not found");
  }

  const asset = await prisma.knowledgeAsset.create({
    data: {
      projectId,
      authorId: actor.id,
      title,
      summary,
      content,
      layer,
      tags,
      sourceUrl,
    },
  });

  await writeAudit({
    actorId: actor.id,
    entityType: "KNOWLEDGE",
    entityId: asset.id,
    action: "KNOWLEDGE_CREATE",
    meta: JSON.stringify({ layer, projectId }),
  });

  revalidatePath("/knowledge");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function updateKnowledgeAssetAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "knowledge.create");

  const id = req(formData, "id");
  const title = req(formData, "title");
  const content = req(formData, "content");
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const tags = String(formData.get("tags") ?? "").trim() || null;
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim() || null;

  const existing = await prisma.knowledgeAsset.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error("Knowledge asset not found");
  if (!actor.isSuperAdmin && existing.authorId !== actor.id) {
    throw new Error("Only the author or super admin can edit this asset.");
  }

  await prisma.knowledgeAsset.update({
    where: { id },
    data: { title, summary, content, tags, sourceUrl },
  });

  await writeAudit({
    actorId: actor.id,
    entityType: "KNOWLEDGE",
    entityId: id,
    action: "KNOWLEDGE_UPDATE",
  });

  revalidatePath("/knowledge");
  if (existing.projectId) revalidatePath(`/projects/${existing.projectId}`);
}

export async function incrementKnowledgeReuseAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "knowledge.read");
  const id = req(formData, "id");
  const existing = await prisma.knowledgeAsset.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error("Knowledge asset not found");

  await prisma.knowledgeAsset.update({
    where: { id },
    data: { reuseCount: { increment: 1 } },
  });

  await writeAudit({
    actorId: actor.id,
    entityType: "KNOWLEDGE",
    entityId: id,
    action: "KNOWLEDGE_REUSED",
  });

  revalidatePath("/knowledge");
  if (existing.projectId) revalidatePath(`/projects/${existing.projectId}`);
}

export async function softDeleteKnowledgeAssetAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "knowledge.create");
  const id = req(formData, "id");
  const existing = await prisma.knowledgeAsset.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error("Knowledge asset not found");
  if (!actor.isSuperAdmin && existing.authorId !== actor.id) {
    throw new Error("Only the author or super admin can delete this asset.");
  }

  await prisma.knowledgeAsset.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAudit({
    actorId: actor.id,
    entityType: "KNOWLEDGE",
    entityId: id,
    action: "KNOWLEDGE_SOFT_DELETE",
  });
  revalidatePath("/knowledge");
}

export async function restoreKnowledgeAssetAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "knowledge.create");
  const id = req(formData, "id");
  const existing = await prisma.knowledgeAsset.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!existing) throw new Error("Knowledge asset not found in trash");
  if (!actor.isSuperAdmin && existing.authorId !== actor.id) {
    throw new Error("Only the author or super admin can restore this asset.");
  }

  await prisma.knowledgeAsset.update({
    where: { id },
    data: { deletedAt: null },
  });
  await writeAudit({
    actorId: actor.id,
    entityType: "KNOWLEDGE",
    entityId: id,
    action: "KNOWLEDGE_RESTORE",
  });
  revalidatePath("/knowledge");
}
