"use server";

import { revalidatePath } from "next/cache";
import { FeedbackCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canViewProject, isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { AuditEntityType } from "@prisma/client";
import { appendFeedbackScores, clearFeedbackScores } from "@/lib/scoring";
import { getFeedbackLabelDef } from "@/lib/feedback-catalog";

function must(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

function canSubmitFeedback(actor: AccessUser, projectId: string | null) {
  if (isSuperAdmin(actor)) return true;
  if (projectId) {
    const pm = actor.projectMemberships.some((m) => m.projectId === projectId && m.roleDefinition.key === "PROJECT_MANAGER");
    if (pm) return true;
  }
  return actor.companyMemberships.some((m) => m.roleDefinition.key === "COMPANY_ADMIN") || actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN");
}

function canSubmitFeedbackOnProject(
  actor: AccessUser,
  project: { id: string; companyId: string; company: { orgGroupId: string } },
) {
  if (!canViewProject(actor, project)) return false;
  if (isSuperAdmin(actor)) return true;
  if (isGroupAdmin(actor, project.company.orgGroupId)) return true;
  if (isCompanyAdmin(actor, project.companyId)) return true;
  return actor.projectMemberships.some((m) => m.projectId === project.id && m.roleDefinition.key === "PROJECT_MANAGER");
}

function canSubmitFeedbackWithoutProject(actor: AccessUser) {
  return isSuperAdmin(actor) || actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN");
}

async function resolveFeedbackProjectContext(actor: AccessUser, projectId: string | null) {
  if (!projectId) {
    if (!canSubmitFeedbackWithoutProject(actor)) {
      throw new Error("Project context is required for this observation.");
    }
    return { companyId: null, projectId: null };
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project || !canSubmitFeedbackOnProject(actor, project)) throw new Error("Forbidden");

  return {
    companyId: project.companyId,
    projectId: project.id,
  };
}

async function loadManagedFeedback(actor: AccessUser, feedbackId: string) {
  const existing = await prisma.feedbackEvent.findFirst({
    where: { id: feedbackId },
    include: {
      project: {
        include: { company: true },
      },
    },
  });
  if (!existing) throw new Error("Observation not found");

  if (existing.project) {
    if (!canSubmitFeedbackOnProject(actor, existing.project)) throw new Error("Forbidden");
  } else if (!canSubmitFeedbackWithoutProject(actor)) {
    throw new Error("Forbidden");
  }

  return existing;
}

function revalidateFeedbackPaths(toUserId: string, projectIds: Array<string | null | undefined>) {
  revalidatePath(`/staff/${toUserId}`);
  for (const projectId of new Set(projectIds.filter(Boolean))) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/growth`);
  }
  revalidatePath("/home");
}

export async function createFeedbackEventAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "feedback.submit");

  const toUserId = must(formData, "toUserId");
  const category = must(formData, "category") as FeedbackCategory;
  const secondaryLabelKey = must(formData, "secondaryLabelKey");
  if (!getFeedbackLabelDef(category, secondaryLabelKey)) throw new Error("Invalid secondary label");
  const message = String(formData.get("message") ?? "").trim() || null;
  const projectId = String(formData.get("projectId") ?? "").trim() || null;
  const workflowNodeId = String(formData.get("workflowNodeId") ?? "").trim() || null;
  const knowledgeAssetId = String(formData.get("knowledgeAssetId") ?? "").trim() || null;

  if (!canSubmitFeedback(actor, projectId)) throw new Error("Forbidden");

  const target = await prisma.user.findFirst({ where: { id: toUserId, deletedAt: null } });
  if (!target) throw new Error("Member not found");
  const context = await resolveFeedbackProjectContext(actor, projectId);

  const row = await prisma.feedbackEvent.create({
    data: {
      fromUserId: actor.id,
      toUserId,
      projectId: context.projectId,
      workflowNodeId,
      knowledgeAssetId,
      category,
      secondaryLabelKey,
      message,
    },
  });

  await appendFeedbackScores(prisma, {
    toUserId,
    category,
    feedbackId: row.id,
    companyId: context.companyId,
    projectId: context.projectId,
  });

  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.FEEDBACK,
    entityId: row.id,
    action: "CREATE",
    meta: JSON.stringify({ toUserId, category }),
  });

  const { evaluateImprovementTriggersForUser } = await import("@/lib/lifecycle-triggers");
  await evaluateImprovementTriggersForUser(toUserId);

  revalidateFeedbackPaths(toUserId, [context.projectId]);
}

export async function updateFeedbackEventAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "feedback.submit");

  const feedbackId = must(formData, "feedbackId");
  const category = must(formData, "category") as FeedbackCategory;
  const secondaryLabelKey = must(formData, "secondaryLabelKey");
  if (!getFeedbackLabelDef(category, secondaryLabelKey)) throw new Error("Invalid secondary label");
  const message = String(formData.get("message") ?? "").trim() || null;
  const projectId = String(formData.get("projectId") ?? "").trim() || null;

  const existing = await loadManagedFeedback(actor, feedbackId);
  const context = await resolveFeedbackProjectContext(actor, projectId);
  const clearLinkedContext = existing.projectId !== context.projectId;

  await prisma.$transaction(async (tx) => {
    await tx.feedbackEvent.update({
      where: { id: feedbackId },
      data: {
        projectId: context.projectId,
        workflowNodeId: clearLinkedContext ? null : existing.workflowNodeId,
        knowledgeAssetId: clearLinkedContext ? null : existing.knowledgeAssetId,
        category,
        secondaryLabelKey,
        message,
      },
    });

    await clearFeedbackScores(tx, feedbackId);
    await appendFeedbackScores(tx, {
      toUserId: existing.toUserId,
      category,
      feedbackId,
      companyId: context.companyId,
      projectId: context.projectId,
    });
  });

  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.FEEDBACK,
    entityId: feedbackId,
    action: "UPDATE",
    meta: JSON.stringify({
      oldProjectId: existing.projectId,
      newProjectId: context.projectId,
      oldCategory: existing.category,
      newCategory: category,
    }),
  });

  const { evaluateImprovementTriggersForUser } = await import("@/lib/lifecycle-triggers");
  await evaluateImprovementTriggersForUser(existing.toUserId);

  revalidateFeedbackPaths(existing.toUserId, [existing.projectId, context.projectId]);
}

export async function deleteFeedbackEventAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "feedback.submit");

  const feedbackId = must(formData, "feedbackId");
  const existing = await loadManagedFeedback(actor, feedbackId);

  await prisma.$transaction(async (tx) => {
    await clearFeedbackScores(tx, feedbackId);
    await tx.feedbackEvent.delete({ where: { id: feedbackId } });
  });

  await writeAudit({
    actorId: actor.id,
    entityType: AuditEntityType.FEEDBACK,
    entityId: feedbackId,
    action: "DELETE",
    meta: JSON.stringify({
      toUserId: existing.toUserId,
      projectId: existing.projectId,
      category: existing.category,
    }),
  });

  const { evaluateImprovementTriggersForUser } = await import("@/lib/lifecycle-triggers");
  await evaluateImprovementTriggersForUser(existing.toUserId);

  revalidateFeedbackPaths(existing.toUserId, [existing.projectId]);
}
