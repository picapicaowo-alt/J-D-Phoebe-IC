"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canEditWorkflow, canViewProject, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
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

export async function uploadWorkflowAttachmentAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.workflow.update");

  const nodeId = String(formData.get("workflowNodeId") ?? "").trim();
  if (!nodeId) throw new Error("Missing workflowNodeId");

  const node = await prisma.workflowNode.findFirst({
    where: { id: nodeId, deletedAt: null },
    include: { project: { include: { company: true } } },
  });
  if (!node || !canEditWorkflow(user, node.project)) throw new Error("Forbidden");

  const file = formData.get("file");
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
    throw new Error("Missing file");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const fileName = sanitizeFileName(file.name || "upload");
  const mimeType = file.type || "application/octet-stream";
  const sizeBytes = buf.length;
  const meta = metaFromForm(formData);
  const prevRaw = String(formData.get("previousVersionId") ?? "").trim();
  let previousVersionId: string | null = null;
  if (prevRaw) {
    const p = await prisma.attachment.findFirst({
      where: { id: prevRaw, deletedAt: null, workflowNodeId: nodeId },
    });
    if (!p) throw new Error("Invalid version");
    previousVersionId = p.id;
  }

  const { storageKey, blobUrl } = await storeFile(buf, fileName, mimeType, `workflow/${node.projectId}/${nodeId}`);

  await prisma.attachment.create({
    data: {
      workflowNodeId: nodeId,
      previousVersionId,
      fileName,
      mimeType,
      sizeBytes,
      storageKey,
      blobUrl,
      uploadedById: user.id,
      ...meta,
    },
  });

  revalidatePath(`/projects/${node.projectId}/workflow`);
  revalidatePath(`/projects/${node.projectId}`);
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
