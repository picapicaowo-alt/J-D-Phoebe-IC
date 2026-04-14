import type { AccessUser } from "@/lib/access";
import { canEditWorkflow, canViewProject, isSuperAdmin } from "@/lib/access";
import { canAccessMemberOutput } from "@/lib/member-output-access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type AttachmentRow = {
  id: string;
  uploadedById: string;
  workflowNodeId: string | null;
  projectId: string | null;
  knowledgeAssetId: string | null;
  contributorUserId: string | null;
  memberOutputId: string | null;
  node: { project: Parameters<typeof canViewProject>[1] } | null;
  project: Parameters<typeof canViewProject>[1] | null;
  knowledgeAsset: { authorId: string } | null;
};

export async function canViewAttachment(actor: AccessUser, att: AttachmentRow): Promise<boolean> {
  if (isSuperAdmin(actor)) return true;
  if (att.node?.project && canViewProject(actor, att.node.project)) return true;
  if (att.project && canViewProject(actor, att.project)) return true;
  if (att.knowledgeAsset) {
    return (
      actor.id === att.knowledgeAsset.authorId || (await userHasPermission(actor, "knowledge.read"))
    );
  }
  if (att.contributorUserId) return actor.id === att.contributorUserId;
  if (att.memberOutputId) return canAccessMemberOutput(actor, att.memberOutputId);
  return false;
}

/** Who may remove an attachment to trash (same gate as upload for scoped resources, else uploader). */
export async function canManageAttachment(actor: AccessUser, att: AttachmentRow): Promise<boolean> {
  if (isSuperAdmin(actor)) return true;
  if (att.uploadedById === actor.id) return true;
  if (att.node?.project && canEditWorkflow(actor, att.node.project)) return true;
  if (att.project) {
    if (!canViewProject(actor, att.project)) return false;
    const isMember = actor.projectMemberships.some((m) => m.projectId === att.project!.id);
    return isMember || canEditWorkflow(actor, att.project);
  }
  if (att.knowledgeAsset) {
    return actor.id === att.knowledgeAsset.authorId;
  }
  if (att.memberOutputId) {
    const mo = await prisma.memberOutput.findFirst({ where: { id: att.memberOutputId, deletedAt: null } });
    if (!mo) return false;
    if (actor.id === mo.userId) return true;
    return await userHasPermission(actor, "staff.update");
  }
  if (att.contributorUserId) return actor.id === att.contributorUserId;
  return false;
}
