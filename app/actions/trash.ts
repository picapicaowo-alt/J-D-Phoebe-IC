"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canManageProjectSettings, isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { canManageStaffTarget } from "@/lib/scoped-role-access";
import { ensureRbacCatalog } from "@/lib/rbac-sync";

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

function getStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

export async function softDeleteUserAction(formData: FormData) {
  await ensureRbacCatalog();

  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.soft_delete");
  const userId = requireString(formData, "userId");
  if (actor.id === userId) throw new Error("You cannot trash your own account here.");
  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      isSuperAdmin: true,
      groupMemberships: { select: { orgGroupId: true } },
      companyMemberships: { select: { companyId: true, company: { select: { orgGroupId: true } } } },
      projectMemberships: {
        select: {
          projectId: true,
          project: { select: { companyId: true, company: { select: { orgGroupId: true } } } },
        },
      },
    },
  });
  if (!target) throw new Error("Not found");
  if (!(await canManageStaffTarget(actor, target, "staff.soft_delete"))) throw new Error("Forbidden");

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), active: false },
  });
  await writeAudit({ actorId: actor.id, entityType: "USER", entityId: userId, action: "SOFT_DELETE" });
  revalidatePath("/staff");
  revalidatePath("/trash");
}

export async function restoreUserAction(formData: FormData) {
  await ensureRbacCatalog();

  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "trash.restore");
  await assertPermission(actor, "staff.restore");
  const userId = requireString(formData, "userId");
  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: { not: null } },
    select: {
      id: true,
      isSuperAdmin: true,
      groupMemberships: { select: { orgGroupId: true } },
      companyMemberships: { select: { companyId: true, company: { select: { orgGroupId: true } } } },
      projectMemberships: {
        select: {
          projectId: true,
          project: { select: { companyId: true, company: { select: { orgGroupId: true } } } },
        },
      },
    },
  });
  if (!target) throw new Error("Not found");
  if (!(await canManageStaffTarget(actor, target, "staff.restore"))) throw new Error("Forbidden");

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null, active: true },
  });
  await writeAudit({ actorId: actor.id, entityType: "USER", entityId: userId, action: "RESTORE_TRASH" });
  revalidatePath("/staff");
  revalidatePath("/trash");
}

export async function purgeUserAction(formData: FormData) {
  await ensureRbacCatalog();

  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "trash.purge");
  await assertPermission(actor, "staff.purge");
  if (!isSuperAdmin(actor) && !actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) {
    throw new Error("Forbidden");
  }
  const userId = requireString(formData, "userId");
  const target = await prisma.user.findFirst({ where: { id: userId, deletedAt: { not: null } } });
  if (!target) throw new Error("Not found");
  if (target.isSuperAdmin) throw new Error("Cannot purge super admin.");

  await prisma.attachment.deleteMany({ where: { uploadedById: userId } });
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/trash");
}

export async function softDeleteCompanyAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "company.soft_delete");
  const companyId = requireString(formData, "companyId");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, company.orgGroupId)) throw new Error("Forbidden");

  await prisma.company.update({
    where: { id: companyId },
    data: { deletedAt: new Date() },
  });
  await writeAudit({ actorId: user.id, entityType: "COMPANY", entityId: companyId, action: "SOFT_DELETE" });
  revalidatePath("/companies");
  revalidatePath("/group");
  revalidatePath("/trash");
}

export async function restoreCompanyTrashAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "trash.restore");
  const companyId = requireString(formData, "companyId");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: { not: null } } });
  if (!company) throw new Error("Not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, company.orgGroupId)) throw new Error("Forbidden");
  await assertPermission(user, "company.restore");

  await prisma.company.update({
    where: { id: companyId },
    data: { deletedAt: null },
  });
  await writeAudit({ actorId: user.id, entityType: "COMPANY", entityId: companyId, action: "RESTORE_TRASH" });
  revalidatePath("/companies");
  revalidatePath("/trash");
}

export async function purgeCompanyAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "trash.purge");
  await assertPermission(user, "company.purge");
  const companyId = requireString(formData, "companyId");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: { not: null } } });
  if (!company) throw new Error("Not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, company.orgGroupId)) throw new Error("Forbidden");

  await prisma.company.delete({ where: { id: companyId } });
  revalidatePath("/trash");
}

export async function softDeleteProjectAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const projectId = requireString(formData, "projectId");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Not found");
  if (!canManageProjectSettings(user, project)) throw new Error("Forbidden");

  await prisma.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date() },
  });
  await writeAudit({ actorId: user.id, entityType: "PROJECT", entityId: projectId, action: "SOFT_DELETE" });
  revalidatePath("/projects");
  revalidatePath("/calendar");
  revalidatePath("/trash");
}

export async function softDeleteProjectsBulkAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const projectIds = [...new Set(getStringArray(formData, "projectIds"))];
  if (!projectIds.length) return;

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds }, deletedAt: null },
    include: { company: true },
  });
  if (projects.length !== projectIds.length) throw new Error("Some projects were not found.");

  for (const project of projects) {
    if (!canManageProjectSettings(user, project)) throw new Error("Forbidden");
  }

  await prisma.project.updateMany({
    where: { id: { in: projectIds }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  await Promise.all(
    projectIds.map((projectId) =>
      writeAudit({ actorId: user.id, entityType: "PROJECT", entityId: projectId, action: "SOFT_DELETE" }),
    ),
  );
  revalidatePath("/projects");
  revalidatePath("/calendar");
  revalidatePath("/trash");
}

export async function restoreProjectTrashAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "trash.restore");
  await assertPermission(user, "project.restore");
  const projectId = requireString(formData, "projectId");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: { not: null } },
    include: { company: true },
  });
  if (!project) throw new Error("Not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, project.company.orgGroupId) && !isCompanyAdmin(user, project.companyId)) {
    throw new Error("Forbidden");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { deletedAt: null },
  });
  await writeAudit({ actorId: user.id, entityType: "PROJECT", entityId: projectId, action: "RESTORE_TRASH" });
  revalidatePath("/projects");
  revalidatePath("/calendar");
  revalidatePath("/trash");
}

export async function purgeProjectAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "trash.purge");
  await assertPermission(user, "project.purge");
  const projectId = requireString(formData, "projectId");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: { not: null } },
    include: { company: true },
  });
  if (!project) throw new Error("Not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, project.company.orgGroupId) && !isCompanyAdmin(user, project.companyId)) {
    throw new Error("Forbidden");
  }

  await prisma.project.delete({ where: { id: projectId } });
  revalidatePath("/calendar");
  revalidatePath("/trash");
}
