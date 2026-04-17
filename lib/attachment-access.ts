import type { AccessUser } from "@/lib/access";
import { canEditWorkflow, canViewProject, isGroupAdmin, isSuperAdmin } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";

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
  onboardingPackageFor?: { companyId: string; company: { orgGroupId: string } }[];
  onboardingVideoFor?: { companyId: string; company: { orgGroupId: string } }[];
};

function canViewOnboardingMaterialAttachment(actor: AccessUser, rows: { companyId: string; company: { orgGroupId: string } }[]) {
  return rows.some(
    (row) =>
      actor.companyMemberships.some((membership) => membership.companyId === row.companyId) || isGroupAdmin(actor, row.company.orgGroupId),
  );
}

export async function canViewAttachment(actor: AccessUser, att: AttachmentRow): Promise<boolean> {
  if (isSuperAdmin(actor)) return true;
  if (att.node?.project && canViewProject(actor, att.node.project)) return true;
  if (att.project && canViewProject(actor, att.project)) return true;
  if (att.knowledgeAsset) {
    return (
      actor.id === att.knowledgeAsset.authorId || (await userHasPermission(actor, "knowledge.read"))
    );
  }
  if (canViewOnboardingMaterialAttachment(actor, att.onboardingPackageFor ?? [])) return true;
  if (canViewOnboardingMaterialAttachment(actor, att.onboardingVideoFor ?? [])) return true;
  if (att.contributorUserId) return actor.id === att.contributorUserId;
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
  if (canViewOnboardingMaterialAttachment(actor, att.onboardingPackageFor ?? [])) return true;
  if (canViewOnboardingMaterialAttachment(actor, att.onboardingVideoFor ?? [])) return true;
  if (att.contributorUserId) return actor.id === att.contributorUserId;
  return false;
}
