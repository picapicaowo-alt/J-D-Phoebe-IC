import type { AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ALL_PERMISSION_KEYS, type PermissionKey } from "@/lib/permission-keys";
import { unstable_cache } from "next/cache";
import { cache as reactCache } from "react";

const permissionKeyMemCache = new Map<string, Set<string>>();

async function getPermissionKeysForUserImpl(userId: string, isSuperAdmin: boolean): Promise<Set<string>> {
  if (isSuperAdmin) return new Set(ALL_PERMISSION_KEYS);

  const hit = permissionKeyMemCache.get(userId);
  if (hit) return hit;

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      groupMemberships: { select: { roleDefinitionId: true } },
      companyMemberships: { select: { roleDefinitionId: true } },
      projectMemberships: { select: { roleDefinitionId: true } },
    },
  });
  if (!user) return new Set();

  const roleIds = [
    ...user.groupMemberships.map((m) => m.roleDefinitionId),
    ...user.companyMemberships.map((m) => m.roleDefinitionId),
    ...user.projectMemberships.map((m) => m.roleDefinitionId),
  ];
  const uniqueRoleIds = [...new Set(roleIds)];
  if (!uniqueRoleIds.length) {
    permissionKeyMemCache.set(userId, new Set());
    return new Set();
  }

  const rows = await prisma.rolePermission.findMany({
    where: { roleDefinitionId: { in: uniqueRoleIds }, allowed: true },
    include: { permissionDefinition: { select: { key: true } } },
  });

  const set = new Set(rows.map((r) => r.permissionDefinition.key));
  permissionKeyMemCache.set(userId, set);
  return set;
}

const getPermissionKeysForShellImpl = unstable_cache(
  async (userId: string): Promise<string[]> => {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        groupMemberships: { select: { roleDefinitionId: true } },
        companyMemberships: { select: { roleDefinitionId: true } },
        projectMemberships: { select: { roleDefinitionId: true } },
      },
    });
    if (!user) return [];

    const roleIds = [
      ...user.groupMemberships.map((m) => m.roleDefinitionId),
      ...user.companyMemberships.map((m) => m.roleDefinitionId),
      ...user.projectMemberships.map((m) => m.roleDefinitionId),
    ];
    const uniqueRoleIds = [...new Set(roleIds)];
    if (!uniqueRoleIds.length) return [];

    const rows = await prisma.rolePermission.findMany({
      where: { roleDefinitionId: { in: uniqueRoleIds }, allowed: true },
      include: { permissionDefinition: { select: { key: true } } },
    });

    return [...new Set(rows.map((r) => r.permissionDefinition.key))];
  },
  ["shell-permission-keys"],
  { revalidate: 60 },
);

/** Dedupes permission lookups within a single request (layout + pages). */
export const getPermissionKeysForUser = reactCache(getPermissionKeysForUserImpl);

/**
 * Short-lived cache for app-shell navigation only. Authorization checks should keep
 * using getPermissionKeysForUser()/userHasPermission().
 */
export async function getPermissionKeysForShell(userId: string, isSuperAdmin: boolean): Promise<Set<string>> {
  if (isSuperAdmin) return new Set(ALL_PERMISSION_KEYS);
  return new Set(await getPermissionKeysForShellImpl(userId));
}

export function invalidatePermissionCache(userId: string) {
  permissionKeyMemCache.delete(userId);
}

export async function userHasPermission(user: AccessUser, key: PermissionKey) {
  if (user.isSuperAdmin) return true;
  const keys = await getPermissionKeysForUser(user.id, false);
  return keys.has(key);
}

export async function assertPermission(user: AccessUser, key: PermissionKey) {
  if (user.isSuperAdmin) return;
  const keys = await getPermissionKeysForUser(user.id, false);
  if (!keys.has(key)) {
    throw new Error(`Forbidden: missing permission "${key}"`);
  }
}

/** Users in the given companies whose company role grants `permissionKey`. */
export async function getUserIdsWithPermissionInCompanies(permissionKey: string, companyIds: string[]): Promise<string[]> {
  if (!companyIds.length) return [];
  const rows = await prisma.companyMembership.findMany({
    where: {
      companyId: { in: companyIds },
      user: { deletedAt: null, active: true },
      roleDefinition: {
        rolePermissions: {
          some: {
            allowed: true,
            permissionDefinition: { key: permissionKey },
          },
        },
      },
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}
