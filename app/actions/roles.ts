"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { RoleScope } from "@/lib/rbac-catalog";
import { ensureRbacCatalog } from "@/lib/rbac-sync";

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

function optionalString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

function normalizeRoleKey(raw: string) {
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) throw new Error("Role key must contain letters or numbers.");
  if (normalized.length > 64) throw new Error("Role key is too long.");
  return normalized;
}

function parseRoleScope(raw: string): RoleScope {
  if (raw === "GROUP" || raw === "COMPANY" || raw === "PROJECT") return raw;
  throw new Error("Invalid role scope.");
}

function requireSuperAdmin(user: AccessUser) {
  if (!isSuperAdmin(user)) {
    throw new Error("Only superadmins can manage role definitions.");
  }
}

async function getRoleAssignmentCount(roleId: string) {
  const [groupMemberships, companyMemberships, projectMemberships] = await Promise.all([
    prisma.groupMembership.count({ where: { roleDefinitionId: roleId } }),
    prisma.companyMembership.count({ where: { roleDefinitionId: roleId } }),
    prisma.projectMembership.count({ where: { roleDefinitionId: roleId } }),
  ]);
  return groupMemberships + companyMemberships + projectMemberships;
}

function revalidateRolePaths() {
  revalidatePath("/settings/roles");
  revalidatePath("/settings/permissions");
  revalidatePath("/staff");
  revalidatePath("/projects");
  revalidatePath("/leaderboard");
}

export async function updateRoleDisplayNameAction(formData: FormData) {
  await ensureRbacCatalog();

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
  revalidateRolePaths();
}

export async function createRoleAction(formData: FormData) {
  await ensureRbacCatalog();

  const user = (await requireUser()) as AccessUser;
  requireSuperAdmin(user);

  const key = normalizeRoleKey(requireString(formData, "key"));
  const displayName = requireString(formData, "displayName");
  const description = optionalString(formData, "description");
  const appliesScope = parseRoleScope(requireString(formData, "appliesScope"));

  const existing = await prisma.roleDefinition.findUnique({ where: { key }, select: { id: true } });
  if (existing) throw new Error(`Role key "${key}" already exists.`);

  const created = await prisma.roleDefinition.create({
    data: {
      key,
      displayName,
      description,
      appliesScope,
      system: false,
    },
  });

  await writeAudit({
    actorId: user.id,
    entityType: "ROLE_DEFINITION",
    entityId: created.id,
    action: "CREATE",
    meta: JSON.stringify({ key, appliesScope }),
  });

  revalidateRolePaths();
}

export async function updateRoleDefinitionAction(formData: FormData) {
  await ensureRbacCatalog();

  const user = (await requireUser()) as AccessUser;
  requireSuperAdmin(user);

  const roleId = requireString(formData, "roleId");
  const role = await prisma.roleDefinition.findUnique({ where: { id: roleId } });
  if (!role) throw new Error("Not found");

  const displayName = requireString(formData, "displayName");
  const description = optionalString(formData, "description");
  const assignmentCount = await getRoleAssignmentCount(roleId);

  let key = role.key;
  let appliesScope = role.appliesScope;

  if (!role.system) {
    const nextKey = normalizeRoleKey(requireString(formData, "key"));
    const nextScope = parseRoleScope(requireString(formData, "appliesScope"));

    if (assignmentCount > 0 && (nextKey !== role.key || nextScope !== role.appliesScope)) {
      throw new Error("Assigned roles cannot change key or scope.");
    }

    if (nextKey !== role.key) {
      const keyOwner = await prisma.roleDefinition.findUnique({
        where: { key: nextKey },
        select: { id: true },
      });
      if (keyOwner && keyOwner.id !== role.id) throw new Error(`Role key "${nextKey}" already exists.`);
    }

    key = nextKey;
    appliesScope = nextScope;
  }

  const changedFields: Record<string, { old: string | null; next: string | null }> = {};
  if (displayName !== role.displayName) changedFields.displayName = { old: role.displayName, next: displayName };
  if ((description ?? null) !== (role.description ?? null)) changedFields.description = { old: role.description ?? null, next: description };
  if (key !== role.key) changedFields.key = { old: role.key, next: key };
  if (appliesScope !== role.appliesScope) changedFields.appliesScope = { old: role.appliesScope, next: appliesScope };

  await prisma.roleDefinition.update({
    where: { id: roleId },
    data: { displayName, description, key, appliesScope },
  });

  if (Object.keys(changedFields).length) {
    await writeAudit({
      actorId: user.id,
      entityType: "ROLE_DEFINITION",
      entityId: roleId,
      action: "UPDATE",
      meta: JSON.stringify(changedFields),
    });
  }

  revalidateRolePaths();
}

export async function deleteRoleAction(formData: FormData) {
  await ensureRbacCatalog();

  const user = (await requireUser()) as AccessUser;
  requireSuperAdmin(user);

  const roleId = requireString(formData, "roleId");
  const role = await prisma.roleDefinition.findUnique({ where: { id: roleId } });
  if (!role) throw new Error("Not found");
  if (role.system) throw new Error("System roles cannot be deleted.");

  const assignmentCount = await getRoleAssignmentCount(roleId);
  if (assignmentCount > 0) throw new Error("Remove all assignments before deleting this role.");

  await prisma.roleDefinition.delete({ where: { id: roleId } });
  await writeAudit({
    actorId: user.id,
    entityType: "ROLE_DEFINITION",
    entityId: roleId,
    action: "DELETE",
    meta: JSON.stringify({ key: role.key }),
  });

  revalidateRolePaths();
}
