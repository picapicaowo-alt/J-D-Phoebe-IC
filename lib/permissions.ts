import type { AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ALL_PERMISSION_KEYS, type PermissionKey } from "@/lib/permission-keys";

const cache = new Map<string, Set<string>>();

export async function getPermissionKeysForUser(userId: string, isSuperAdmin: boolean): Promise<Set<string>> {
  if (isSuperAdmin) return new Set(ALL_PERMISSION_KEYS);

  const hit = cache.get(userId);
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
    cache.set(userId, new Set());
    return new Set();
  }

  const rows = await prisma.rolePermission.findMany({
    where: { roleDefinitionId: { in: uniqueRoleIds }, allowed: true },
    include: { permissionDefinition: { select: { key: true } } },
  });

  const set = new Set(rows.map((r) => r.permissionDefinition.key));
  cache.set(userId, set);
  return set;
}

export function invalidatePermissionCache(userId: string) {
  cache.delete(userId);
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
