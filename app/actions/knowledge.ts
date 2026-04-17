"use server";

import { revalidatePath } from "next/cache";
import { KnowledgeLayer } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManageKnowledgeAsset, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { appendKnowledgeReuseScore } from "@/lib/scoring";

function req(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

function getSafeReturnTo(formData: FormData) {
  const raw = String(formData.get("returnTo") ?? "").trim();
  if (!raw.startsWith("/")) return null;
  return raw;
}

function withQueryParam(path: string, key: string, value: string) {
  const [base, hash = ""] = path.split("#", 2);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash ? `#${hash}` : ""}`;
}

export async function createKnowledgeAssetAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "knowledge.create");

  const title = req(formData, "title");
  const contentRaw = String(formData.get("content") ?? "").trim();
  const sourceUrlEarly = String(formData.get("sourceUrl") ?? "").trim() || null;
  const content =
    contentRaw ||
    (sourceUrlEarly ? "(External resource — see primary link below.)" : "");
  if (!content) {
    const returnTo = getSafeReturnTo(formData) ?? "/knowledge/browse?create=1#knowledge-create";
    redirect(withQueryParam(returnTo, "error", "missing_content_or_url"));
  }
  const layer = req(formData, "layer") as KnowledgeLayer;
  const projectIdRaw = String(formData.get("projectId") ?? "").trim();
  const projectId = projectIdRaw || null;
  const companyIdRaw = String(formData.get("companyId") ?? "").trim();
  const titleEn = String(formData.get("titleEn") ?? "").trim() || null;
  const titleZh = String(formData.get("titleZh") ?? "").trim() || null;
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const tags = String(formData.get("tags") ?? "").trim() || null;
  const sourceUrl = sourceUrlEarly;
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
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const tags = String(formData.get("tags") ?? "").trim() || null;

  const existing = await prisma.knowledgeAsset.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error("Knowledge asset not found");
  if (!canManageKnowledgeAsset(actor, existing)) {
    throw new Error("Only the author or super admin can edit this asset.");
  }

  const contentRaw = String(formData.get("content") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim() || null;
  const content =
    contentRaw ||
    (sourceUrl ? "(External resource — see primary link below.)" : existing.content);
  if (!content) throw new Error("Add body text or a primary resource URL.");

  const titleEn = String(formData.get("titleEn") ?? "").trim() || null;
  const titleZh = String(formData.get("titleZh") ?? "").trim() || null;
  let companyId = String(formData.get("companyId") ?? "").trim() || null;
  const language = String(formData.get("language") ?? "").trim() || undefined;
  const layerRaw = String(formData.get("layer") ?? "").trim() as KnowledgeLayer;
  const layer = (Object.values(KnowledgeLayer) as string[]).includes(layerRaw) ? layerRaw : existing.layer;
  const projectIdRaw = String(formData.get("projectId") ?? "").trim();
  const projectId = projectIdRaw || null;
  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!p) throw new Error("Project not found");
    if (!companyId) companyId = p.companyId;
  }

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
      layer,
      projectId,
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
  if (projectId) revalidatePath(`/projects/${projectId}`);
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
  if (!canManageKnowledgeAsset(actor, existing)) {
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
  if (existing.projectId) revalidatePath(`/projects/${existing.projectId}`);
}

export async function restoreKnowledgeAssetAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "knowledge.create");
  const id = req(formData, "id");
  const existing = await prisma.knowledgeAsset.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!existing) throw new Error("Knowledge asset not found in trash");
  if (!canManageKnowledgeAsset(actor, existing)) {
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

export async function deleteKnowledgeAssetAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  if (!actor.isSuperAdmin) {
    throw new Error("Only super admin can permanently delete knowledge.");
  }

  const id = req(formData, "id");
  const existing = await prisma.knowledgeAsset.findFirst({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!existing) throw new Error("Knowledge asset not found");

  await prisma.knowledgeAsset.delete({ where: { id } });
  await writeAudit({
    actorId: actor.id,
    entityType: "KNOWLEDGE",
    entityId: id,
    action: "KNOWLEDGE_HARD_DELETE",
  });
  revalidatePath("/knowledge");
  revalidatePath("/knowledge/browse");
  if (existing.projectId) revalidatePath(`/projects/${existing.projectId}`);
}
