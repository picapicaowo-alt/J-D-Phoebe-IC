"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission, invalidatePermissionCache, userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function createStaffAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.create");
  if (!isSuperAdmin(actor) && !actor.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) {
    throw new Error("Only group-level admins can create staff accounts in this deployment.");
  }

  const email = requireString(formData, "email").toLowerCase();
  const name = requireString(formData, "name");
  const password = requireString(formData, "password");
  const title = String(formData.get("title") ?? "").trim() || null;

  const passwordHash = await hash(password, 10);
  const user = await prisma.user.create({
    data: { email, name, title, passwordHash, active: true },
  });
  await writeAudit({ actorId: actor.id, entityType: "USER", entityId: user.id, action: "CREATE", newValue: email });
  revalidatePath("/staff");
}

export async function updateStaffAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const userId = requireString(formData, "userId");
  const target = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!target) throw new Error("Not found");

  const editingSelf = actor.id === userId;
  if (!editingSelf) {
    await assertPermission(actor, "staff.update");
  }

  const name = requireString(formData, "name");
  const title = String(formData.get("title") ?? "").trim() || null;
  const active = String(formData.get("active") ?? "") === "on";

  if (name !== target.name) {
    await writeAudit({
      actorId: actor.id,
      entityType: "USER",
      entityId: userId,
      action: "RENAME",
      field: "name",
      oldValue: target.name,
      newValue: name,
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      title,
      ...(isSuperAdmin(actor) ? { active } : {}),
    },
  });
  revalidatePath(`/staff/${userId}`);
  revalidatePath("/staff");
}

export async function assignCompanyAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.assign_company");
  const userId = requireString(formData, "userId");
  const companyId = requireString(formData, "companyId");
  const roleDefinitionId = requireString(formData, "roleDefinitionId");

  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, company.orgGroupId) && !isCompanyAdmin(actor, companyId)) {
    throw new Error("Forbidden");
  }

  await prisma.companyMembership.upsert({
    where: { userId_companyId: { userId, companyId } },
    create: { userId, companyId, roleDefinitionId },
    update: { roleDefinitionId },
  });
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/companies/${companyId}`);
}

export async function assignProjectAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.assign_project");
  const userId = requireString(formData, "userId");
  const projectId = requireString(formData, "projectId");
  const roleDefinitionId = requireString(formData, "roleDefinitionId");

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Project not found");
  const isPmOnProject = actor.projectMemberships.some(
    (m) => m.projectId === project.id && m.roleDefinition.key === "PROJECT_MANAGER",
  );
  if (
    !isSuperAdmin(actor) &&
    !isGroupAdmin(actor, project.company.orgGroupId) &&
    !isCompanyAdmin(actor, project.companyId) &&
    !isPmOnProject
  ) {
    throw new Error("Forbidden");
  }

  await prisma.projectMembership.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId, roleDefinitionId },
    update: { roleDefinitionId },
  });
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function removeCompanyMembershipAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.assign_company");
  const userId = requireString(formData, "userId");
  const companyId = requireString(formData, "companyId");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, company.orgGroupId) && !isCompanyAdmin(actor, companyId)) {
    throw new Error("Forbidden");
  }
  await prisma.companyMembership.deleteMany({ where: { userId, companyId } });
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/companies/${companyId}`);
}

export async function removeProjectMembershipAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const canManageMembers = await userHasPermission(actor, "project.member.manage");
  const canStaffAssign = await userHasPermission(actor, "staff.assign_project");
  if (!canManageMembers && !canStaffAssign) throw new Error("Forbidden");
  const userId = requireString(formData, "userId");
  const projectId = requireString(formData, "projectId");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Project not found");
  const isPmOnProject = actor.projectMemberships.some(
    (m) => m.projectId === project.id && m.roleDefinition.key === "PROJECT_MANAGER",
  );
  if (
    !isSuperAdmin(actor) &&
    !isGroupAdmin(actor, project.company.orgGroupId) &&
    !isCompanyAdmin(actor, project.companyId) &&
    !isPmOnProject
  ) {
    throw new Error("Forbidden");
  }
  await prisma.projectMembership.deleteMany({ where: { userId, projectId } });
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function assignMultipleToProjectAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "project.member.manage");
  const projectId = requireString(formData, "projectId");
  const roleDefinitionId = requireString(formData, "roleDefinitionId");
  const memberIds = formData.getAll("memberIds").map((v) => String(v).trim()).filter(Boolean);
  if (!memberIds.length) throw new Error("Select at least one member");

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Project not found");
  const isPmOnProject = actor.projectMemberships.some(
    (m) => m.projectId === project.id && m.roleDefinition.key === "PROJECT_MANAGER",
  );
  if (
    !isSuperAdmin(actor) &&
    !isGroupAdmin(actor, project.company.orgGroupId) &&
    !isCompanyAdmin(actor, project.companyId) &&
    !isPmOnProject
  ) {
    throw new Error("Forbidden");
  }

  const valid = await prisma.user.findMany({
    where: { id: { in: memberIds }, deletedAt: null, active: true },
    select: { id: true },
  });
  for (const { id } of valid) {
    await prisma.projectMembership.upsert({
      where: { userId_projectId: { userId: id, projectId } },
      create: { userId: id, projectId, roleDefinitionId },
      update: { roleDefinitionId },
    });
    invalidatePermissionCache(id);
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/staff");
}
