"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function updateOrgGroupAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "org.group.update");
  const orgGroupId = requireString(formData, "orgGroupId");
  const group = await prisma.orgGroup.findFirst({ where: { id: orgGroupId, deletedAt: null } });
  if (!group) throw new Error("Group not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, orgGroupId)) throw new Error("Forbidden");

  const name = requireString(formData, "name");
  const introduction = String(formData.get("introduction") ?? "").trim() || null;

  if (name !== group.name) {
    await writeAudit({
      actorId: user.id,
      entityType: "ORG_GROUP",
      entityId: orgGroupId,
      action: "RENAME",
      field: "name",
      oldValue: group.name,
      newValue: name,
    });
  }
  if ((group.introduction ?? "") !== (introduction ?? "")) {
    await writeAudit({
      actorId: user.id,
      entityType: "ORG_GROUP",
      entityId: orgGroupId,
      action: "UPDATE",
      field: "introduction",
      oldValue: group.introduction,
      newValue: introduction,
    });
  }

  await prisma.orgGroup.update({
    where: { id: orgGroupId },
    data: { name, introduction },
  });
  revalidatePath("/group");
}
