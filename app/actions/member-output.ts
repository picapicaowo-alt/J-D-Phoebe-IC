"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isSuperAdmin, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
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

async function storeFile(buf: Buffer, fileName: string, folderKey: string) {
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
  await writeFile(path.join(dir, diskName), buf);
  return { storageKey: path.join(relDir, diskName), blobUrl: null };
}

async function assertCanManageMemberOutput(actor: AccessUser, targetUserId: string) {
  if (actor.id === targetUserId || isSuperAdmin(actor)) return;
  if (await userHasPermission(actor, "staff.update")) return;
  throw new Error("Forbidden");
}

export async function createMemberOutputWithAttachmentAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const targetUserId = String(formData.get("userId") ?? "").trim();
  if (!targetUserId) throw new Error("Missing userId");
  await assertCanManageMemberOutput(actor, targetUserId);

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Missing title");

  const projectId = String(formData.get("projectId") ?? "").trim() || null;
  const companyIdRaw = String(formData.get("companyId") ?? "").trim() || null;
  let companyId = companyIdRaw;
  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!p) throw new Error("Project not found");
    if (!companyId) companyId = p.companyId;
  }

  const mo = await prisma.memberOutput.create({
    data: {
      userId: targetUserId,
      projectId,
      companyId,
      title,
      titleEn: String(formData.get("titleEn") ?? "").trim() || null,
      titleZh: String(formData.get("titleZh") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      labels: String(formData.get("labels") ?? "").trim() || null,
    },
  });

  const file = formData.get("file");
  if (file && typeof file !== "string" && "arrayBuffer" in file) {
    const buf = Buffer.from(await file.arrayBuffer());
    const fileName = sanitizeFileName(file.name || "upload");
    const mimeType = file.type || "application/octet-stream";
    const { storageKey, blobUrl } = await storeFile(buf, fileName, `member-output/${mo.id}`);
    await prisma.attachment.create({
      data: {
        memberOutputId: mo.id,
        contributorUserId: targetUserId,
        fileName,
        mimeType,
        sizeBytes: buf.length,
        storageKey,
        blobUrl,
        uploadedById: actor.id,
        ...metaFromForm(formData),
      },
    });
  }

  revalidatePath(`/staff/${targetUserId}`);
}

export async function uploadMemberOutputVersionAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const memberOutputId = String(formData.get("memberOutputId") ?? "").trim();
  if (!memberOutputId) throw new Error("Missing memberOutputId");

  const mo = await prisma.memberOutput.findFirst({ where: { id: memberOutputId, deletedAt: null } });
  if (!mo) throw new Error("Not found");
  await assertCanManageMemberOutput(actor, mo.userId);

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
      where: { id: prevRaw, deletedAt: null, memberOutputId },
    });
    if (!p) throw new Error("Invalid version");
    previousVersionId = p.id;
  }

  const { storageKey, blobUrl } = await storeFile(buf, fileName, `member-output/${memberOutputId}`);

  await prisma.attachment.create({
    data: {
      memberOutputId,
      contributorUserId: mo.userId,
      previousVersionId,
      fileName,
      mimeType,
      sizeBytes: buf.length,
      storageKey,
      blobUrl,
      uploadedById: actor.id,
      ...meta,
    },
  });

  revalidatePath(`/staff/${mo.userId}`);
}

export async function updateMemberOutputMetaAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing id");
  const mo = await prisma.memberOutput.findFirst({ where: { id, deletedAt: null } });
  if (!mo) throw new Error("Not found");
  await assertCanManageMemberOutput(actor, mo.userId);

  await prisma.memberOutput.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? "").trim() || mo.title,
      titleEn: String(formData.get("titleEn") ?? "").trim() || null,
      titleZh: String(formData.get("titleZh") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      labels: String(formData.get("labels") ?? "").trim() || null,
      projectId: String(formData.get("projectId") ?? "").trim() || null,
      companyId: String(formData.get("companyId") ?? "").trim() || null,
    },
  });
  revalidatePath(`/staff/${mo.userId}`);
}
