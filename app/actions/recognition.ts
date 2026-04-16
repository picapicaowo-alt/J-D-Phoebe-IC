"use server";

import { revalidatePath } from "next/cache";
import { AuditEntityType, RecognitionMode, RecognitionTagCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canManageProject, canViewProject, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { getRecognitionLabelDef } from "@/lib/recognition-catalog";
import { appendRecognitionScores, clearRecognitionScores } from "@/lib/scoring";

function must(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

function parseRecognitionFormData(formData: FormData) {
  const toUserId = must(formData, "toUserId");
  const projectId = must(formData, "projectId");
  const mode = must(formData, "mode") as RecognitionMode;
  const tagCategory = must(formData, "tagCategory") as RecognitionTagCategory;
  const secondaryLabelKey = must(formData, "secondaryLabelKey");
  if (!getRecognitionLabelDef(tagCategory, secondaryLabelKey)) throw new Error("Invalid secondary label");

  return {
    toUserId,
    projectId,
    mode,
    tagCategory,
    secondaryLabelKey,
    message: String(formData.get("message") ?? "").trim() || null,
    workflowNodeId: String(formData.get("workflowNodeId") ?? "").trim() || null,
    knowledgeAssetId: String(formData.get("knowledgeAssetId") ?? "").trim() || null,
  };
}

async function loadRecognitionProject(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Project not found");
  return project;
}

async function loadManagedRecognition(actor: AccessUser, recognitionId: string) {
  const existing = await prisma.recognitionEvent.findFirst({
    where: { id: recognitionId },
    include: {
      project: {
        include: { company: true },
      },
    },
  });
  if (!existing) throw new Error("Recognition not found");
  if (!existing.project || !canManageProject(actor, existing.project)) throw new Error("Forbidden");
  return existing;
}

function revalidateRecognitionPaths(toUserId: string, projectIds: Array<string | null | undefined>) {
  revalidatePath(`/staff/${toUserId}`);
  for (const projectId of new Set(projectIds.filter(Boolean))) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/recognition`);
  }
  revalidatePath("/home");
}

export async function createRecognitionAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "recognition.create");

  const { toUserId, projectId, mode, tagCategory, secondaryLabelKey, message, workflowNodeId, knowledgeAssetId } =
    parseRecognitionFormData(formData);

  const [project, user] = await Promise.all([
    loadRecognitionProject(projectId),
    prisma.user.findFirst({ where: { id: toUserId, deletedAt: null } }),
  ]);
  if (!project || !user) throw new Error("Project or member not found");
  if (!canViewProject(actor, project)) throw new Error("Forbidden");

  if (knowledgeAssetId) {
    const ka = await prisma.knowledgeAsset.findFirst({ where: { id: knowledgeAssetId, deletedAt: null } });
    if (!ka) throw new Error("Knowledge asset not found");
  }
  if (workflowNodeId) {
    const n = await prisma.workflowNode.findFirst({ where: { id: workflowNodeId, projectId, deletedAt: null } });
    if (!n) throw new Error("Node not found");
  }

  const def = getRecognitionLabelDef(tagCategory, secondaryLabelKey)!;
  const tagLabel = def.label_en;

  const rec = await prisma.recognitionEvent.create({
    data: {
      fromUserId: mode === RecognitionMode.ANONYMOUS ? null : actor.id,
      toUserId,
      projectId,
      workflowNodeId,
      knowledgeAssetId,
      mode,
      tagCategory,
      secondaryLabelKey,
      tagLabel,
      message,
    },
  });

  await appendRecognitionScores(prisma, {
    toUserId,
    tagCategory,
    recognitionId: rec.id,
    companyId: project.companyId,
    projectId,
  });

  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.RECOGNITION,
    entityId: rec.id,
    action: "CREATE",
    meta: JSON.stringify({ toUserId, projectId, mode, tagCategory, secondaryLabelKey }),
  });

  const { evaluateRecognitionTriggersForUser } = await import("@/lib/lifecycle-triggers");
  await evaluateRecognitionTriggersForUser(toUserId);

  revalidateRecognitionPaths(toUserId, [projectId]);
}

export async function createStaffRecognitionAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "recognition.create");

  const { toUserId, projectId, mode, tagCategory, secondaryLabelKey, message } = parseRecognitionFormData(formData);
  const [project, user] = await Promise.all([
    loadRecognitionProject(projectId),
    prisma.user.findFirst({ where: { id: toUserId, deletedAt: null } }),
  ]);
  if (!user) throw new Error("Member not found");
  if (!canManageProject(actor, project)) throw new Error("Forbidden");

  const def = getRecognitionLabelDef(tagCategory, secondaryLabelKey)!;
  const rec = await prisma.recognitionEvent.create({
    data: {
      fromUserId: mode === RecognitionMode.ANONYMOUS ? null : actor.id,
      toUserId,
      projectId,
      mode,
      tagCategory,
      secondaryLabelKey,
      tagLabel: def.label_en,
      message,
    },
  });

  await appendRecognitionScores(prisma, {
    toUserId,
    tagCategory,
    recognitionId: rec.id,
    companyId: project.companyId,
    projectId,
  });

  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.RECOGNITION,
    entityId: rec.id,
    action: "CREATE",
    meta: JSON.stringify({ toUserId, projectId, mode, tagCategory, secondaryLabelKey, source: "staff" }),
  });

  const { evaluateRecognitionTriggersForUser } = await import("@/lib/lifecycle-triggers");
  await evaluateRecognitionTriggersForUser(toUserId);

  revalidateRecognitionPaths(toUserId, [projectId]);
}

export async function updateStaffRecognitionAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "recognition.create");

  const recognitionId = must(formData, "recognitionId");
  const { projectId, mode, tagCategory, secondaryLabelKey, message } = parseRecognitionFormData(formData);
  const [existing, project] = await Promise.all([
    loadManagedRecognition(actor, recognitionId),
    loadRecognitionProject(projectId),
  ]);
  if (!canManageProject(actor, project)) throw new Error("Forbidden");

  const def = getRecognitionLabelDef(tagCategory, secondaryLabelKey)!;
  const clearLinkedContext = existing.projectId !== projectId;

  await prisma.$transaction(async (tx) => {
    await tx.recognitionEvent.update({
      where: { id: recognitionId },
      data: {
        fromUserId: mode === RecognitionMode.ANONYMOUS ? null : (existing.fromUserId ?? actor.id),
        projectId,
        workflowNodeId: clearLinkedContext ? null : existing.workflowNodeId,
        knowledgeAssetId: clearLinkedContext ? null : existing.knowledgeAssetId,
        mode,
        tagCategory,
        secondaryLabelKey,
        tagLabel: def.label_en,
        message,
      },
    });

    await clearRecognitionScores(tx, recognitionId);
    await appendRecognitionScores(tx, {
      toUserId: existing.toUserId,
      tagCategory,
      recognitionId,
      companyId: project.companyId,
      projectId,
    });
  });

  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.RECOGNITION,
    entityId: recognitionId,
    action: "UPDATE",
    meta: JSON.stringify({
      oldProjectId: existing.projectId,
      newProjectId: projectId,
      oldTagCategory: existing.tagCategory,
      newTagCategory: tagCategory,
      oldMode: existing.mode,
      newMode: mode,
    }),
  });

  const { evaluateRecognitionTriggersForUser } = await import("@/lib/lifecycle-triggers");
  await evaluateRecognitionTriggersForUser(existing.toUserId);

  revalidateRecognitionPaths(existing.toUserId, [existing.projectId, projectId]);
}

export async function deleteStaffRecognitionAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "recognition.create");

  const recognitionId = must(formData, "recognitionId");
  const existing = await loadManagedRecognition(actor, recognitionId);

  await prisma.$transaction(async (tx) => {
    await clearRecognitionScores(tx, recognitionId);
    await tx.recognitionEvent.delete({ where: { id: recognitionId } });
  });

  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.RECOGNITION,
    entityId: recognitionId,
    action: "DELETE",
    meta: JSON.stringify({
      toUserId: existing.toUserId,
      projectId: existing.projectId,
      tagCategory: existing.tagCategory,
      mode: existing.mode,
    }),
  });

  const { evaluateRecognitionTriggersForUser } = await import("@/lib/lifecycle-triggers");
  await evaluateRecognitionTriggersForUser(existing.toUserId);

  revalidateRecognitionPaths(existing.toUserId, [existing.projectId]);
}
