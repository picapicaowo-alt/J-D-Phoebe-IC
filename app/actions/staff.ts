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

  const data: { name: string; title: string | null; active?: boolean; contactEmails?: string | null; phone?: string | null } = {
    name,
    title,
    ...(isSuperAdmin(actor) ? { active } : {}),
  };
  if (formData.has("contactEmails")) {
    data.contactEmails = String(formData.get("contactEmails") ?? "").trim() || null;
  }
  if (formData.has("phone")) {
    data.phone = String(formData.get("phone") ?? "").trim() || null;
  }

  await prisma.user.update({
    where: { id: userId },
    data,
  });
  revalidatePath(`/staff/${userId}`);
  revalidatePath("/staff");
  revalidatePath("/settings/profile");
  revalidatePath("/home");
}

export async function assignCompanyAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.assign_company");
  const userId = requireString(formData, "userId");
  const companyId = requireString(formData, "companyId");
  const roleDefinitionId = requireString(formData, "roleDefinitionId");
  const departmentIdRaw = String(formData.get("departmentId") ?? "").trim();
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, company.orgGroupId) && !isCompanyAdmin(actor, companyId)) {
    throw new Error("Forbidden");
  }

  const departmentId: string | null = departmentIdRaw
    ? await (async () => {
        const d = await prisma.department.findFirst({ where: { id: departmentIdRaw, companyId } });
        if (!d) throw new Error("Invalid department for this company");
        return d.id;
      })()
    : null;

  const supervisorUserIdRaw = String(formData.get("supervisorUserId") ?? "").trim();
  const supervisorUserId = supervisorUserIdRaw
    ? await (async () => {
        const u = await prisma.user.findFirst({ where: { id: supervisorUserIdRaw, deletedAt: null } });
        if (!u) throw new Error("Invalid supervisor");
        return u.id;
      })()
    : null;

  await prisma.companyMembership.upsert({
    where: { userId_companyId: { userId, companyId } },
    create: { userId, companyId, roleDefinitionId, departmentId, supervisorUserId },
    update: { roleDefinitionId, departmentId, supervisorUserId },
  });
  const { ensureMemberOnboardingForCompany } = await import("@/lib/member-onboarding");
  await ensureMemberOnboardingForCompany(userId, companyId);
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/companies/${companyId}`);
}

export async function updateCompanyMembershipSupervisorAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.assign_company");
  const userId = requireString(formData, "userId");
  const companyId = requireString(formData, "companyId");
  const supervisorUserIdRaw = String(formData.get("supervisorUserId") ?? "").trim();
  const supervisorUserId = supervisorUserIdRaw
    ? await (async () => {
        const u = await prisma.user.findFirst({ where: { id: supervisorUserIdRaw, deletedAt: null } });
        if (!u) throw new Error("Invalid supervisor");
        return u.id;
      })()
    : null;

  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, company.orgGroupId) && !isCompanyAdmin(actor, companyId)) {
    throw new Error("Forbidden");
  }

  const membership = await prisma.companyMembership.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  if (!membership) throw new Error("User is not a member of this company");

  await prisma.companyMembership.update({
    where: { id: membership.id },
    data: { supervisorUserId },
  });
  const { ensureMemberOnboardingForCompany } = await import("@/lib/member-onboarding");
  await ensureMemberOnboardingForCompany(userId, companyId);
  if (supervisorUserId) {
    const sup = await prisma.user.findFirst({ where: { id: supervisorUserId } });
    if (sup) {
      await prisma.memberOnboarding.updateMany({
        where: { userId, companyId },
        data: { liaisonUserId: sup.id, liaisonName: sup.name, liaisonEmail: sup.email },
      });
    }
  } else {
    await prisma.memberOnboarding.updateMany({
      where: { userId, companyId },
      data: { liaisonUserId: null, liaisonName: null, liaisonEmail: null },
    });
  }
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/companies/${companyId}`);
}

export async function updateCompanyMembershipDepartmentAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "staff.assign_company");
  const userId = requireString(formData, "userId");
  const companyId = requireString(formData, "companyId");
  const departmentIdRaw = String(formData.get("departmentId") ?? "").trim();

  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, company.orgGroupId) && !isCompanyAdmin(actor, companyId)) {
    throw new Error("Forbidden");
  }

  const departmentId: string | null = departmentIdRaw
    ? await (async () => {
        const d = await prisma.department.findFirst({ where: { id: departmentIdRaw, companyId } });
        if (!d) throw new Error("Invalid department for this company");
        return d.id;
      })()
    : null;

  const membership = await prisma.companyMembership.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  if (!membership) throw new Error("User is not a member of this company");

  await prisma.companyMembership.update({
    where: { id: membership.id },
    data: { departmentId },
  });
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/staff");
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
