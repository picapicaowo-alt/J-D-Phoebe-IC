import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PERMISSION_KEYS } from "@/lib/permission-keys";
import { SYSTEM_ROLE_DEFINITIONS, SYSTEM_ROLE_PERMISSION_KEYS } from "@/lib/rbac-catalog";

type RbacDb = Pick<PrismaClient, "permissionDefinition" | "roleDefinition" | "rolePermission">;

export async function ensureRbacCatalog(db: RbacDb = prisma) {
  const permissionRows = await Promise.all(
    PERMISSION_KEYS.map((key) =>
      db.permissionDefinition.upsert({
        where: { key },
        update: {},
        create: {
          key,
          description: key.replaceAll(".", " "),
          category: key.split(".")[0] ?? "misc",
        },
      }),
    ),
  );

  const permissionIdByKey = new Map(permissionRows.map((row) => [row.key, row.id]));

  for (const role of SYSTEM_ROLE_DEFINITIONS) {
    const existing = await db.roleDefinition.findUnique({
      where: { key: role.key },
      select: { id: true },
    });
    if (existing) continue;

    const created = await db.roleDefinition.create({ data: role });
    const defaultPermissionKeys = SYSTEM_ROLE_PERMISSION_KEYS[role.key] ?? [];

    if (!defaultPermissionKeys.length) continue;

    await db.rolePermission.createMany({
      data: defaultPermissionKeys.flatMap((key) => {
        const permissionDefinitionId = permissionIdByKey.get(key);
        return permissionDefinitionId ? [{ roleDefinitionId: created.id, permissionDefinitionId, allowed: true }] : [];
      }),
      skipDuplicates: true,
    });
  }
}
