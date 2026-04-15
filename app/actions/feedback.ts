"use server";

import { revalidatePath } from "next/cache";
import { FeedbackCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canViewProject, isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { AuditEntityType } from "@prisma/client";
import { appendFeedbackScores } from "@/lib/scoring";
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

  if (!projectId && !isSuperAdmin(actor) && !actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) {
    throw new Error("Project context is required for this observation.");
  }
  if (!canSubmitFeedback(actor, projectId)) throw new Error("Forbidden");

  const target = await prisma.user.findFirst({ where: { id: toUserId, deletedAt: null } });
  if (!target) throw new Error("Member not found");

  let companyId: string | null = null;
  if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, include: { company: true } });
    if (!p || !canViewProject(actor, p)) throw new Error("Forbidden");
    companyId = p.companyId;
    if (!isSuperAdmin(actor) && !isGroupAdmin(actor, p.company.orgGroupId) && !isCompanyAdmin(actor, p.companyId)) {
      const isPm = actor.projectMemberships.some((m) => m.projectId === p.id && m.roleDefinition.key === "PROJECT_MANAGER");
      if (!isPm) throw new Error("Forbidden");
    }
  }

  const row = await prisma.feedbackEvent.create({
    data: {
      fromUserId: actor.id,
      toUserId,
      projectId,
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
    companyId,
    projectId,
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

  revalidatePath(`/staff/${toUserId}`);
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/growth`);
  }
  revalidatePath("/home");
}
