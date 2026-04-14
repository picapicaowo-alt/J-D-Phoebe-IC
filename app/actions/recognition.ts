"use server";

import { revalidatePath } from "next/cache";
import { RecognitionMode, RecognitionTagCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canViewProject, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { getRecognitionLabelDef } from "@/lib/recognition-catalog";
import { appendRecognitionScores } from "@/lib/scoring";

function must(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function createRecognitionAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "recognition.create");

  const toUserId = must(formData, "toUserId");
  const projectId = must(formData, "projectId");
  const mode = must(formData, "mode") as RecognitionMode;
  const tagCategory = must(formData, "tagCategory") as RecognitionTagCategory;
  const secondaryLabelKey = must(formData, "secondaryLabelKey");
  if (!getRecognitionLabelDef(tagCategory, secondaryLabelKey)) throw new Error("Invalid secondary label");
  const message = String(formData.get("message") ?? "").trim() || null;
  const workflowNodeId = String(formData.get("workflowNodeId") ?? "").trim() || null;
  const knowledgeAssetId = String(formData.get("knowledgeAssetId") ?? "").trim() || null;

  const [project, user] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, include: { company: true } }),
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
    entityType: "RECOGNITION",
    entityId: rec.id,
    action: "CREATE",
    meta: JSON.stringify({ toUserId, projectId, mode, tagCategory, secondaryLabelKey }),
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/staff/${toUserId}`);
  revalidatePath("/home");
}
