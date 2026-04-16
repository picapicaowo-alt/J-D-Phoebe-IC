"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { AttachmentResourceKind } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canEditWorkflow, canManageProject, canViewProject, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission, userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

function metaFromForm(formData: FormData) {
  return {
    description: String(formData.get("description") ?? "").trim() || null,
    labels: String(formData.get("labels") ?? "").trim() || null,
    titleEn: String(formData.get("titleEn") ?? "").trim() || null,
    titleZh: String(formData.get("titleZh") ?? "").trim() || null,
  };
}

function mustHttpUrl(formData: FormData, key = "externalUrl") {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) throw new Error("Missing URL");
  if (!/^https?:\/\//i.test(raw)) throw new Error("URL must start with http:// or https://");
  try {
    new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  return raw;
}

async function storeFile(
  buf: Buffer,
  fileName: string,
  mimeType: string,
  folderKey: string,
): Promise<{ storageKey: string; blobUrl: string | null }> {
  const safeName = sanitizeFileName(fileName);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const key = `${folderKey}/${randomUUID()}-${safeName}`;
    const blob = await put(key, buf, { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN });
    return { storageKey: key, blobUrl: blob.url };
  }
  const relDir = path.join("uploads", folderKey);
  const dir = path.join(process.cwd(), relDir);
  await mkdir(dir, { recursive: true });
  const diskName = `${randomUUID()}-${safeName}`;
  const full = path.join(dir, diskName);
  await writeFile(full, buf);
  return { storageKey: path.join(relDir, diskName), blobUrl: null };
}

export async function uploadProjectAttachmentAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.read");

  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) throw new Error("Missing projectId");

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project || !canViewProject(user, project)) throw new Error("Forbidden");
  const isMember = user.projectMemberships.some((m) => m.projectId === projectId);
  if (!isMember && !canEditWorkflow(user, project)) throw new Error("Forbidden");

  const file = formData.get("file");
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) throw new Error("Missing file");

  const buf = Buffer.from(await file.arrayBuffer());
  const fileName = sanitizeFileName(file.name || "upload");
  const mimeType = file.type || "application/octet-stream";
  const meta = metaFromForm(formData);
  const prevRaw = String(formData.get("previousVersionId") ?? "").trim();
  let previousVersionId: string | null = null;
  if (prevRaw) {
    const p = await prisma.attachment.findFirst({
      where: { id: prevRaw, deletedAt: null, projectId },
    });
    if (!p) throw new Error("Invalid version");
    previousVersionId = p.id;
  }

  const { storageKey, blobUrl } = await storeFile(buf, fileName, mimeType, `project/${projectId}`);

  await prisma.attachment.create({
    data: {
      resourceKind: AttachmentResourceKind.FILE,
      projectId,
      previousVersionId,
      fileName,
      mimeType,
      sizeBytes: buf.length,
      storageKey,
      blobUrl,
      uploadedById: user.id,
      ...meta,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function uploadKnowledgeAttachmentAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "knowledge.create");

  const knowledgeAssetId = String(formData.get("knowledgeAssetId") ?? "").trim();
  if (!knowledgeAssetId) throw new Error("Missing knowledgeAssetId");

  const asset = await prisma.knowledgeAsset.findFirst({ where: { id: knowledgeAssetId, deletedAt: null } });
  if (!asset) throw new Error("Not found");
  if (!user.isSuperAdmin && asset.authorId !== user.id) throw new Error("Forbidden");

  const file = formData.get("file");
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) throw new Error("Missing file");

  const buf = Buffer.from(await file.arrayBuffer());
  const fileName = sanitizeFileName(file.name || "upload");
  const mimeType = file.type || "application/octet-stream";
  const meta = metaFromForm(formData);
  const prevRaw = String(formData.get("previousVersionId") ?? "").trim();
  let previousVersionId: string | null = null;
  if (prevRaw) {
    const p = await prisma.attachment.findFirst({
      where: { id: prevRaw, deletedAt: null, knowledgeAssetId },
    });
    if (!p) throw new Error("Invalid version");
    previousVersionId = p.id;
  }

  const { storageKey, blobUrl } = await storeFile(buf, fileName, mimeType, `knowledge/${knowledgeAssetId}`);

  await prisma.attachment.create({
    data: {
      resourceKind: AttachmentResourceKind.FILE,
      knowledgeAssetId,
      previousVersionId,
      fileName,
      mimeType,
      sizeBytes: buf.length,
      storageKey,
      blobUrl,
      uploadedById: user.id,
      ...meta,
    },
  });

  revalidatePath("/knowledge");
  revalidatePath("/knowledge/browse");
  if (asset.projectId) revalidatePath(`/projects/${asset.projectId}`);
}

/** Phase 1: external links (Drive, docs, etc.) instead of file uploads. */
export async function addExternalResourceLinkAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const url = mustHttpUrl(formData, "externalUrl");
  const labelRaw = String(formData.get("label") ?? "").trim();
  let fileName = labelRaw;
  if (!fileName) {
    try {
      fileName = new URL(url).hostname.replace(/^www\./, "") || "Resource link";
    } catch {
      fileName = "Resource link";
    }
  }
  const meta = metaFromForm(formData);
  const prevRaw = String(formData.get("previousVersionId") ?? "").trim();

  const projectId = String(formData.get("projectId") ?? "").trim() || null;
  const knowledgeAssetId = String(formData.get("knowledgeAssetId") ?? "").trim() || null;
  const memberOutputId = String(formData.get("memberOutputId") ?? "").trim();
  if (memberOutputId) throw new Error("Member outputs are disabled.");
  const scopes = [projectId, knowledgeAssetId].filter(Boolean);
  if (scopes.length !== 1) throw new Error("Specify exactly one attachment target.");

  let previousVersionId: string | null = null;

  if (projectId) {
    await assertPermission(user, "project.read");
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { company: true },
    });
    if (!project || !canViewProject(user, project)) throw new Error("Forbidden");
    const isMember = user.projectMemberships.some((m) => m.projectId === projectId);
    if (!isMember && !canEditWorkflow(user, project)) throw new Error("Forbidden");
    if (prevRaw) {
      const prev = await prisma.attachment.findFirst({
        where: { id: prevRaw, deletedAt: null, projectId },
      });
      if (!prev) throw new Error("Invalid version");
      previousVersionId = prev.id;
    }
    await prisma.attachment.create({
      data: {
        resourceKind: AttachmentResourceKind.EXTERNAL_URL,
        externalUrl: url,
        projectId,
        previousVersionId,
        fileName,
        mimeType: "text/uri-list",
        sizeBytes: 0,
        storageKey: null,
        blobUrl: null,
        uploadedById: user.id,
        ...meta,
      },
    });
    revalidatePath(`/projects/${projectId}`);
    return;
  }

  if (knowledgeAssetId) {
    await assertPermission(user, "knowledge.create");
    const asset = await prisma.knowledgeAsset.findFirst({ where: { id: knowledgeAssetId, deletedAt: null } });
    if (!asset) throw new Error("Not found");
    if (!user.isSuperAdmin && asset.authorId !== user.id) throw new Error("Forbidden");
    if (prevRaw) {
      const prev = await prisma.attachment.findFirst({
        where: { id: prevRaw, deletedAt: null, knowledgeAssetId },
      });
      if (!prev) throw new Error("Invalid version");
      previousVersionId = prev.id;
    }
    await prisma.attachment.create({
      data: {
        resourceKind: AttachmentResourceKind.EXTERNAL_URL,
        externalUrl: url,
        knowledgeAssetId,
        previousVersionId,
        fileName,
        mimeType: "text/uri-list",
        sizeBytes: 0,
        storageKey: null,
        blobUrl: null,
        uploadedById: user.id,
        ...meta,
      },
    });
    revalidatePath("/knowledge");
    revalidatePath("/knowledge/browse");
    if (asset.projectId) revalidatePath(`/projects/${asset.projectId}`);
    return;
  }

  if (memberOutputId) {
    const mo = await prisma.memberOutput.findFirst({ where: { id: memberOutputId, deletedAt: null } });
    if (!mo) throw new Error("Not found");
    if (user.id !== mo.userId && !isSuperAdmin(user) && !(await userHasPermission(user, "staff.update"))) {
      throw new Error("Forbidden");
    }
    if (prevRaw) {
      const prev = await prisma.attachment.findFirst({
        where: { id: prevRaw, deletedAt: null, memberOutputId },
      });
      if (!prev) throw new Error("Invalid version");
      previousVersionId = prev.id;
    }
    await prisma.attachment.create({
      data: {
        resourceKind: AttachmentResourceKind.EXTERNAL_URL,
        externalUrl: url,
        memberOutputId,
        contributorUserId: mo.userId,
        previousVersionId,
        fileName,
        mimeType: "text/uri-list",
        sizeBytes: 0,
        storageKey: null,
        blobUrl: null,
        uploadedById: user.id,
        ...meta,
      },
    });
    revalidatePath(`/staff/${mo.userId}`);
  }
}

export async function updateProjectExternalLinkAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.update");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing id");
  const url = mustHttpUrl(formData, "externalUrl");
  const fileName = String(formData.get("fileName") ?? "").trim() || "Resource link";
  const description = String(formData.get("description") ?? "").trim() || null;

  const att = await prisma.attachment.findFirst({
    where: { id, deletedAt: null, projectId: { not: null } },
    include: { project: { include: { company: true } } },
  });
  if (!att?.projectId || !att.project) throw new Error("Not found");
  if (!canManageProject(user, att.project)) throw new Error("Forbidden");
  if (att.resourceKind !== AttachmentResourceKind.EXTERNAL_URL) throw new Error("Only external links can be edited here.");

  await prisma.attachment.update({
    where: { id },
    data: { externalUrl: url, fileName, description },
  });
  revalidatePath(`/projects/${att.projectId}`);
}
