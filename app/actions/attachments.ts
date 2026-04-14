"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canEditWorkflow, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
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

  let storageKey: string;
  let blobUrl: string | null = null;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const key = `workflow/${node.projectId}/${nodeId}/${randomUUID()}-${fileName}`;
    const blob = await put(key, buf, { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN });
    storageKey = key;
    blobUrl = blob.url;
  } else {
    const dir = path.join(process.cwd(), "uploads", node.projectId, nodeId);
    await mkdir(dir, { recursive: true });
    const diskName = `${randomUUID()}-${fileName}`;
    const full = path.join(dir, diskName);
    await writeFile(full, buf);
    storageKey = path.join("uploads", node.projectId, nodeId, diskName);
  }

  await prisma.attachment.create({
    data: {
      workflowNodeId: nodeId,
      fileName,
      mimeType,
      sizeBytes,
      storageKey,
      blobUrl,
      uploadedById: user.id,
    },
  });

  revalidatePath(`/projects/${node.projectId}/workflow`);
}
