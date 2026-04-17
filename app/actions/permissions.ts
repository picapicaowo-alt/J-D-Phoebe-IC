"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { type AccessUser } from "@/lib/access";
import { assertPermission, invalidatePermissionCache } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { ensureRbacCatalog } from "@/lib/rbac-sync";

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function setRolePermissionAction(formData: FormData) {
  await ensureRbacCatalog();

  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "permission.matrix.update");

  const roleDefinitionId = requireString(formData, "roleDefinitionId");
  const permissionDefinitionId = requireString(formData, "permissionDefinitionId");
  const allowed = String(formData.get("allowed") ?? "") === "true" || String(formData.get("allowed") ?? "") === "on";

  const role = await prisma.roleDefinition.findUnique({ where: { id: roleDefinitionId } });
  if (!role) throw new Error("Role not found");

  await prisma.rolePermission.deleteMany({
    where: { roleDefinitionId, permissionDefinitionId },
  });
  if (allowed) {
    await prisma.rolePermission.create({
      data: { roleDefinitionId, permissionDefinitionId, allowed: true },
    });
  }

  const allUsers = await prisma.user.findMany({ select: { id: true } });
  for (const u of allUsers) invalidatePermissionCache(u.id);

  await writeAudit({
    actorId: user.id,
    entityType: "PERMISSION",
    entityId: permissionDefinitionId,
    action: "MATRIX_UPDATE",
    meta: JSON.stringify({ roleDefinitionId, allowed }),
  });

  revalidatePath("/settings/permissions");
}
