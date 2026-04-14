"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canManageAttachment } from "@/lib/attachment-access";

const includeAtt = {
  node: { include: { project: { include: { company: true } } } },
  project: { include: { company: true } },
  knowledgeAsset: { select: { authorId: true } },
} as const;

export async function softDeleteAttachmentAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing id");

  const att = await prisma.attachment.findFirst({
    where: { id, deletedAt: null },
    include: includeAtt,
  });
  if (!att) throw new Error("Not found");
  if (!(await canManageAttachment(actor, att))) throw new Error("Forbidden");

  await prisma.attachment.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath("/trash");
  revalidatePath("/knowledge");
  revalidatePath("/knowledge/browse");
  if (att.workflowNodeId) {
    const n = await prisma.workflowNode.findFirst({ where: { id: att.workflowNodeId }, select: { projectId: true } });
    if (n) revalidatePath(`/projects/${n.projectId}/workflow`);
  }
  if (att.projectId) revalidatePath(`/projects/${att.projectId}`);
  if (att.knowledgeAssetId) {
    const k = await prisma.knowledgeAsset.findFirst({ where: { id: att.knowledgeAssetId }, select: { projectId: true } });
    if (k?.projectId) revalidatePath(`/projects/${k.projectId}`);
  }
  if (att.memberOutputId) {
    const mo = await prisma.memberOutput.findFirst({ where: { id: att.memberOutputId }, select: { userId: true } });
    if (mo) revalidatePath(`/staff/${mo.userId}`);
  }
}

export async function restoreAttachmentTrashAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "trash.restore");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing id");

  const att = await prisma.attachment.findFirst({
    where: { id, deletedAt: { not: null } },
    include: includeAtt,
  });
  if (!att) throw new Error("Not found");
  if (!(await canManageAttachment(actor, att)) && !actor.isSuperAdmin) throw new Error("Forbidden");

  await prisma.attachment.update({ where: { id }, data: { deletedAt: null } });
  revalidatePath("/trash");
  revalidatePath("/knowledge");
  revalidatePath("/knowledge/browse");
  if (att.projectId) revalidatePath(`/projects/${att.projectId}`);
  if (att.workflowNodeId) {
    const n = await prisma.workflowNode.findFirst({ where: { id: att.workflowNodeId }, select: { projectId: true } });
    if (n) revalidatePath(`/projects/${n.projectId}/workflow`);
  }
  if (att.memberOutputId) {
    const mo = await prisma.memberOutput.findFirst({ where: { id: att.memberOutputId }, select: { userId: true } });
    if (mo) revalidatePath(`/staff/${mo.userId}`);
  }
}
