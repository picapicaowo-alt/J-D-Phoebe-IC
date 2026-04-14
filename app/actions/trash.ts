"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function softDeleteUserAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.soft_delete");
  if (!isSuperAdmin(actor) && !actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) {
    throw new Error("Forbidden");
  }
  const userId = requireString(formData, "userId");
  if (actor.id === userId) throw new Error("You cannot trash your own account here.");
  const target = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!target) throw new Error("Not found");
  if (target.isSuperAdmin && !isSuperAdmin(actor)) throw new Error("Forbidden");

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), active: false },
  });
  await writeAudit({ actorId: actor.id, entityType: "USER", entityId: userId, action: "SOFT_DELETE" });
  revalidatePath("/staff");
  revalidatePath("/trash");
}

export async function restoreUserAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "trash.restore");
  await assertPermission(actor, "staff.restore");
  if (!isSuperAdmin(actor) && !actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) {
    throw new Error("Forbidden");
  }
  const userId = requireString(formData, "userId");
  const target = await prisma.user.findFirst({ where: { id: userId, deletedAt: { not: null } } });
  if (!target) throw new Error("Not found");

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null, active: true },
  });
  await writeAudit({ actorId: actor.id, entityType: "USER", entityId: userId, action: "RESTORE_TRASH" });
  revalidatePath("/staff");
  revalidatePath("/trash");
}

export async function purgeUserAction(formData: FormData) {
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
  await assertPermission(user, "project.soft_delete");
  const projectId = requireString(formData, "projectId");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, project.company.orgGroupId) && !isCompanyAdmin(user, project.companyId)) {
    throw new Error("Forbidden");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date() },
  });
  await writeAudit({ actorId: user.id, entityType: "PROJECT", entityId: projectId, action: "SOFT_DELETE" });
  revalidatePath("/projects");
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
  revalidatePath("/trash");
}
