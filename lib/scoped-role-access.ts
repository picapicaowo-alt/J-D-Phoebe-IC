import { canManageProjectSettings, type AccessUser } from "@/lib/access";
import type { PermissionKey } from "@/lib/permission-keys";
import { prisma } from "@/lib/prisma";

type CompanyScope = {
  id: string;
  orgGroupId: string;
};

type ProjectScope = {
  id: string;
  ownerId: string;
  companyId: string;
  company: { orgGroupId: string };
};

type StaffScopeTarget = {
  id: string;
  isSuperAdmin?: boolean;
  groupMemberships: { orgGroupId: string }[];
  companyMemberships: { companyId: string; company: { orgGroupId: string } }[];
  projectMemberships: { projectId: string; project: { companyId: string; company: { orgGroupId: string } } }[];
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
    ...user.groupMemberships
      .map((membership) => membership.roleDefinitionId)
      .filter((roleId): roleId is string => Boolean(roleId)),
    ...user.companyMemberships
      .map((membership) => membership.roleDefinitionId)
      .filter((roleId): roleId is string => Boolean(roleId)),
    ...user.projectMemberships
      .map((membership) => membership.roleDefinitionId)
      .filter((roleId): roleId is string => Boolean(roleId)),
  ];
  const uniqueRoleIds = [...new Set(roleIds)];
  if (!uniqueRoleIds.length) return byPermission;

  const permissionRows = await prisma.permissionDefinition.findMany({
    where: { key: { in: uniquePermissionKeys } },
    select: { id: true, key: true },
  });
  const permissionKeyById = new Map(permissionRows.map((row) => [row.id, row.key as PermissionKey]));
  if (!permissionRows.length) return byPermission;

  const rows = await prisma.rolePermission.findMany({
    where: {
      roleDefinitionId: { in: uniqueRoleIds },
      allowed: true,
      permissionDefinitionId: { in: permissionRows.map((row) => row.id) },
    },
    select: {
      roleDefinitionId: true,
      permissionDefinitionId: true,
    },
  });

  for (const row of rows) {
    const key = permissionKeyById.get(row.permissionDefinitionId);
    if (key) byPermission.get(key)?.add(row.roleDefinitionId);
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

export function canCreateProjectInCompanyWithRoleIds(
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
    ) ||
    user.projectMemberships.some(
      (membership) =>
        membership.project.companyId === company.id &&
        !!membership.roleDefinitionId &&
        allowedRoleIds.has(membership.roleDefinitionId),
    )
  );
}

export async function canCreateProjectInCompany(user: AccessUser, company: CompanyScope) {
  const byPermission = await getActorRoleIdsByPermission(user, ["project.create"]);
  return canCreateProjectInCompanyWithRoleIds(user, company, byPermission.get("project.create") ?? new Set());
}

export async function canManageCompanyMemberships(user: AccessUser, company: CompanyScope) {
  const byPermission = await getActorRoleIdsByPermission(user, ["staff.assign_company"]);
  return canManageCompanyScopeWithRoleIds(user, company, byPermission.get("staff.assign_company") ?? new Set());
}

export async function canManageProjectMemberships(user: AccessUser, project: ProjectScope) {
  if (canManageProjectSettings(user, project)) return true;
  const byPermission = await getActorRoleIdsByPermission(user, ["project.member.manage", "staff.assign_project"]);
  return canManageProjectScopeWithRoleIds(
    user,
    project,
    mergeRoleIdSets(byPermission.get("project.member.manage"), byPermission.get("staff.assign_project")),
  );
}

export function canManageStaffTargetWithRoleIds(
  user: AccessUser,
  target: StaffScopeTarget,
  allowedRoleIds: ReadonlySet<string>,
) {
  if (user.isSuperAdmin) return true;
  if (target.isSuperAdmin) return false;
  if (!allowedRoleIds.size) return false;

  return (
    target.groupMemberships.some((membership) =>
      user.groupMemberships.some(
        (actorMembership) =>
          actorMembership.orgGroupId === membership.orgGroupId &&
          !!actorMembership.roleDefinitionId &&
          allowedRoleIds.has(actorMembership.roleDefinitionId),
      ),
    ) ||
    target.companyMemberships.some((membership) =>
      canManageCompanyScopeWithRoleIds(
        user,
        { id: membership.companyId, orgGroupId: membership.company.orgGroupId },
        allowedRoleIds,
      ),
    ) ||
    target.projectMemberships.some((membership) =>
      canManageProjectScopeWithRoleIds(
        user,
        {
          id: membership.projectId,
          ownerId: "",
          companyId: membership.project.companyId,
          company: { orgGroupId: membership.project.company.orgGroupId },
        },
        allowedRoleIds,
      ),
    )
  );
}

export async function canManageStaffTarget(user: AccessUser, target: StaffScopeTarget, permissionKey: PermissionKey) {
  const byPermission = await getActorRoleIdsByPermission(user, [permissionKey]);
  return canManageStaffTargetWithRoleIds(user, target, byPermission.get(permissionKey) ?? new Set());
}
