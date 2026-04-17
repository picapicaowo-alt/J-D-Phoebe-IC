import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PERMISSION_KEYS } from "@/lib/permission-keys";
import { SYSTEM_ROLE_DEFINITIONS, SYSTEM_ROLE_PERMISSION_KEYS } from "@/lib/rbac-catalog";

type RbacDb = Pick<PrismaClient, "permissionDefinition" | "roleDefinition" | "rolePermission">;

const RBAC_SYNC_COOLDOWN_MS = 60_000;

let lastCatalogSyncAt = 0;
let catalogSyncPromise: Promise<void> | null = null;

async function ensureRbacCatalogOnce(db: RbacDb) {
  await db.permissionDefinition.createMany({
    data: PERMISSION_KEYS.map((key) => ({
      key,
      description: key.replaceAll(".", " "),
      category: key.split(".")[0] ?? "misc",
    })),
    skipDuplicates: true,
  });

  const permissionRows = await db.permissionDefinition.findMany({
    where: { key: { in: [...PERMISSION_KEYS] } },
    select: { id: true, key: true },
  });
  const permissionIdByKey = new Map(permissionRows.map((row) => [row.key, row.id]));

  await db.roleDefinition.createMany({
    data: SYSTEM_ROLE_DEFINITIONS,
    skipDuplicates: true,
  });

  const roleRows = await db.roleDefinition.findMany({
    where: { key: { in: SYSTEM_ROLE_DEFINITIONS.map((role) => role.key) } },
    select: { id: true, key: true },
  });
  const roleIdByKey = new Map(roleRows.map((row) => [row.key, row.id]));

  const rolePermissionRows = SYSTEM_ROLE_DEFINITIONS.flatMap((role) => {
    const roleDefinitionId = roleIdByKey.get(role.key);
    if (!roleDefinitionId) return [];

    return (SYSTEM_ROLE_PERMISSION_KEYS[role.key] ?? []).flatMap((key) => {
      const permissionDefinitionId = permissionIdByKey.get(key);
      return permissionDefinitionId ? [{ roleDefinitionId, permissionDefinitionId, allowed: true }] : [];
    });
  });

  if (rolePermissionRows.length) {
    await db.rolePermission.createMany({
      data: rolePermissionRows,
      skipDuplicates: true,
    });
  }
}

export async function ensureRbacCatalog(db: RbacDb = prisma) {
  if (db !== prisma) {
    await ensureRbacCatalogOnce(db);
    return;
  }

  const now = Date.now();
  if (lastCatalogSyncAt && now - lastCatalogSyncAt < RBAC_SYNC_COOLDOWN_MS) return;
  if (catalogSyncPromise) return catalogSyncPromise;

  catalogSyncPromise = ensureRbacCatalogOnce(db).finally(() => {
    lastCatalogSyncAt = Date.now();
    catalogSyncPromise = null;
  });

  return catalogSyncPromise;
}
