import type { AccessUser } from "@/lib/access";
import type { PermissionKey } from "@/lib/permission-keys";
import { prisma } from "@/lib/prisma";

type CompanyScope = {
  id: string;
  orgGroupId: string;
};

type ProjectScope = {
  id: string;
  companyId: string;
  company: { orgGroupId: string };
};

export async function getActorRoleIdsByPermission(
  user: AccessUser,
  permissionKeys: readonly PermissionKey[],
): Promise<Map<PermissionKey, Set<string>>> {
  const uniquePermissionKeys = [...new Set(permissionKeys)];
  const byPermission = new Map<PermissionKey, Set<string>>();
  for (const key of uniquePermissionKeys) byPermission.set(key, new Set());
  if (!uniquePermissionKeys.length || user.isSuperAdmin) return byPermission;

  const roleIds = [
    ...user.groupMemberships.map((membership) => membership.roleDefinitionId).filter(Boolean),
    ...user.companyMemberships.map((membership) => membership.roleDefinitionId).filter(Boolean),
    ...user.projectMemberships.map((membership) => membership.roleDefinitionId).filter(Boolean),
  ];
  const uniqueRoleIds = [...new Set(roleIds)];
  if (!uniqueRoleIds.length) return byPermission;

  const rows = await prisma.rolePermission.findMany({
    where: {
      roleDefinitionId: { in: uniqueRoleIds },
      allowed: true,
      permissionDefinition: { key: { in: uniquePermissionKeys } },
    },
    select: {
      roleDefinitionId: true,
      permissionDefinition: { select: { key: true } },
    },
  });

  for (const row of rows) {
    const key = row.permissionDefinition.key as PermissionKey;
    byPermission.get(key)?.add(row.roleDefinitionId);
  }

  return byPermission;
}

export function mergeRoleIdSets(...sets: Array<Set<string> | undefined>): Set<string> {
  const merged = new Set<string>();
  for (const set of sets) {
    if (!set) continue;
    for (const roleId of set) merged.add(roleId);
  }
  return merged;
}

export function canManageCompanyScopeWithRoleIds(
  user: AccessUser,
  company: CompanyScope,
  allowedRoleIds: ReadonlySet<string>,
) {
  if (user.isSuperAdmin) return true;
  if (!allowedRoleIds.size) return false;

  return (
    user.groupMemberships.some(
      (membership) =>
        membership.orgGroupId === company.orgGroupId &&
        !!membership.roleDefinitionId &&
        allowedRoleIds.has(membership.roleDefinitionId),
    ) ||
    user.companyMemberships.some(
      (membership) =>
        membership.companyId === company.id &&
        !!membership.roleDefinitionId &&
        allowedRoleIds.has(membership.roleDefinitionId),
    )
  );
}

export function canManageProjectScopeWithRoleIds(
  user: AccessUser,
  project: ProjectScope,
  allowedRoleIds: ReadonlySet<string>,
) {
  if (user.isSuperAdmin) return true;
  if (!allowedRoleIds.size) return false;

  return (
    user.groupMemberships.some(
      (membership) =>
        membership.orgGroupId === project.company.orgGroupId &&
        !!membership.roleDefinitionId &&
        allowedRoleIds.has(membership.roleDefinitionId),
    ) ||
    user.companyMemberships.some(
      (membership) =>
        membership.companyId === project.companyId &&
        !!membership.roleDefinitionId &&
        allowedRoleIds.has(membership.roleDefinitionId),
    ) ||
    user.projectMemberships.some(
      (membership) =>
        membership.projectId === project.id &&
        !!membership.roleDefinitionId &&
        allowedRoleIds.has(membership.roleDefinitionId),
    )
  );
}

export async function canManageCompanyMemberships(user: AccessUser, company: CompanyScope) {
  const byPermission = await getActorRoleIdsByPermission(user, ["staff.assign_company"]);
  return canManageCompanyScopeWithRoleIds(user, company, byPermission.get("staff.assign_company") ?? new Set());
}

export async function canManageProjectMemberships(user: AccessUser, project: ProjectScope) {
  const byPermission = await getActorRoleIdsByPermission(user, ["project.member.manage", "staff.assign_project"]);
  return canManageProjectScopeWithRoleIds(
    user,
    project,
    mergeRoleIdSets(byPermission.get("project.member.manage"), byPermission.get("staff.assign_project")),
  );
}
