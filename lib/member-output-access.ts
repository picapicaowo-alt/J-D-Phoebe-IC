import type { AccessUser } from "@/lib/access";
import { canViewProject, isCompanyAdmin, isGroupAdmin, isSuperAdmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export async function canAccessMemberOutput(actor: AccessUser, memberOutputId: string): Promise<boolean> {
  if (isSuperAdmin(actor)) return true;
  const mo = await prisma.memberOutput.findFirst({
    where: { id: memberOutputId, deletedAt: null },
    include: {
      project: { include: { company: true } },
      user: {
        include: {
          companyMemberships: { include: { company: { select: { orgGroupId: true } } } },
        },
      },
    },
  });
  if (!mo) return false;
  if (actor.id === mo.userId) return true;
  if (mo.projectId && mo.project && canViewProject(actor, mo.project)) return true;
  if (mo.companyId && isCompanyAdmin(actor, mo.companyId)) return true;
  for (const cm of mo.user.companyMemberships) {
    if (isGroupAdmin(actor, cm.company.orgGroupId)) return true;
  }
  const targetCompanyIds = new Set(mo.user.companyMemberships.map((c) => c.companyId));
  for (const m of actor.companyMemberships) {
    if (targetCompanyIds.has(m.companyId)) {
      if (await userHasPermission(actor, "staff.read")) return true;
      break;
    }
  }
  return false;
}
