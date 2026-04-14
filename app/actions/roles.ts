"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function updateRoleDisplayNameAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "role.display_name.update");

  const roleId = requireString(formData, "roleId");
  const displayName = requireString(formData, "displayName");
  const role = await prisma.roleDefinition.findUnique({ where: { id: roleId } });
  if (!role) throw new Error("Not found");

  if (displayName !== role.displayName) {
    await writeAudit({
      actorId: user.id,
      entityType: "ROLE_DEFINITION",
      entityId: roleId,
      action: "RENAME",
      field: "displayName",
      oldValue: role.displayName,
      newValue: displayName,
    });
  }

  await prisma.roleDefinition.update({ where: { id: roleId }, data: { displayName } });
  revalidatePath("/settings/roles");
}
