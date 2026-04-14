"use server";

import { revalidatePath } from "next/cache";
import { KnowledgeLayer } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { appendKnowledgeReuseScore } from "@/lib/scoring";

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
  const companyIdRaw = String(formData.get("companyId") ?? "").trim();
  const titleEn = String(formData.get("titleEn") ?? "").trim() || null;
  const titleZh = String(formData.get("titleZh") ?? "").trim() || null;
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const tags = String(formData.get("tags") ?? "").trim() || null;
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim() || null;
  const language = String(formData.get("language") ?? "").trim() || "mixed";

  let companyId: string | null = companyIdRaw || null;
  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!p) throw new Error("Project not found");
    if (!companyId) companyId = p.companyId;
  }

  const asset = await prisma.knowledgeAsset.create({
    data: {
      projectId,
      companyId,
      authorId: actor.id,
      title,
      titleEn,
      titleZh,
      summary,
      content,
      layer,
      tags,
      sourceUrl,
      language,
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
  revalidatePath("/knowledge/browse");
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

  const titleEn = String(formData.get("titleEn") ?? "").trim() || null;
  const titleZh = String(formData.get("titleZh") ?? "").trim() || null;
  const companyId = String(formData.get("companyId") ?? "").trim() || null;
  const language = String(formData.get("language") ?? "").trim() || undefined;

  await prisma.knowledgeAsset.update({
    where: { id },
    data: {
      title,
      titleEn,
      titleZh,
      summary,
      content,
      tags,
      sourceUrl,
      ...(companyId !== null && companyId !== "" ? { companyId } : { companyId: null }),
      ...(language ? { language } : {}),
    },
  });

  await writeAudit({
    actorId: actor.id,
    entityType: "KNOWLEDGE",
    entityId: id,
    action: "KNOWLEDGE_UPDATE",
  });

  revalidatePath("/knowledge");
  revalidatePath("/knowledge/browse");
  if (existing.projectId) revalidatePath(`/projects/${existing.projectId}`);
}

export async function incrementKnowledgeReuseAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "knowledge.read");
  const id = req(formData, "id");
  const existing = await prisma.knowledgeAsset.findFirst({
    where: { id, deletedAt: null },
    include: { project: true },
  });
  if (!existing) throw new Error("Knowledge asset not found");

  await prisma.knowledgeAsset.update({
    where: { id },
    data: { reuseCount: { increment: 1 } },
  });
  await prisma.knowledgeReuseEvent.create({
    data: { knowledgeAssetId: id, userId: actor.id },
  });
  await appendKnowledgeReuseScore(prisma, {
    userId: existing.authorId,
    assetId: id,
    companyId: existing.companyId ?? existing.project?.companyId ?? null,
    projectId: existing.projectId,
  });

  await writeAudit({
    actorId: actor.id,
    entityType: "KNOWLEDGE",
    entityId: id,
    action: "KNOWLEDGE_REUSED",
  });

  revalidatePath("/knowledge");
  revalidatePath("/knowledge/browse");
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
  revalidatePath("/knowledge/browse");
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
  revalidatePath("/knowledge/browse");
}
