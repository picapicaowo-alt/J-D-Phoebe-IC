"use server";

import { revalidatePath } from "next/cache";
import { invalidateAccessUserCache, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission, invalidatePermissionCache } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canManageCompanyMemberships, canManageProjectMemberships } from "@/lib/scoped-role-access";
import { normalizeTimeZone } from "@/lib/timezone";

function requireString(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
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
  const signature = String(formData.get("signature") ?? "").trim() || null;
  const active = String(formData.get("active") ?? "") === "on";
  const nextIsSuperAdmin = isSuperAdmin(actor) ? String(formData.get("isSuperAdmin") ?? "") === "on" : target.isSuperAdmin;

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

  if (target.isSuperAdmin !== nextIsSuperAdmin) {
    await writeAudit({
      actorId: actor.id,
      entityType: "USER",
      entityId: userId,
      action: nextIsSuperAdmin ? "SUPERADMIN_GRANT" : "SUPERADMIN_REVOKE",
      field: "isSuperAdmin",
      oldValue: String(target.isSuperAdmin),
      newValue: String(nextIsSuperAdmin),
    });
  }

  const data: {
    name: string;
    title: string | null;
    signature?: string | null;
    active?: boolean;
    isSuperAdmin?: boolean;
    contactEmails?: string | null;
    phone?: string | null;
    timezone?: string;
  } = {
    name,
    title,
    ...(isSuperAdmin(actor) ? { active, isSuperAdmin: nextIsSuperAdmin } : {}),
  };
  if (formData.has("contactEmails")) {
    data.contactEmails = String(formData.get("contactEmails") ?? "").trim() || null;
  }
  if (formData.has("signature")) {
    data.signature = signature;
  }
  if (formData.has("phone")) {
    data.phone = String(formData.get("phone") ?? "").trim() || null;
  }
  if (formData.has("timezone")) {
    data.timezone = normalizeTimeZone(String(formData.get("timezone") ?? ""));
  }

  await prisma.user.update({
    where: { id: userId },
    data,
  });
  invalidateAccessUserCache(target);
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath("/staff");
  revalidatePath("/settings/profile");
  revalidatePath("/home");
}

export async function assignCompanyAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const userId = requireString(formData, "userId");
  const companyId = requireString(formData, "companyId");
  const roleDefinitionId = requireString(formData, "roleDefinitionId");
  const departmentIdRaw = String(formData.get("departmentId") ?? "").trim();
  const [company, role] = await Promise.all([
    prisma.company.findFirst({ where: { id: companyId, deletedAt: null } }),
    prisma.roleDefinition.findFirst({ where: { id: roleDefinitionId, appliesScope: "COMPANY" } }),
  ]);
  if (!company) throw new Error("Company not found");
  if (!role) throw new Error("Invalid company role");
  if (!(await canManageCompanyMemberships(actor, company))) throw new Error("Forbidden");

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
    create: { userId, companyId, roleDefinitionId: role.id, departmentId, supervisorUserId },
    update: { roleDefinitionId: role.id, departmentId, supervisorUserId },
  });
  const { ensureMemberOnboardingForCompany } = await import("@/lib/member-onboarding");
  await ensureMemberOnboardingForCompany(userId, companyId);
  invalidateAccessUserCache(userId);
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/companies/${companyId}`);
}

export async function updateCompanyMembershipSupervisorAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
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
  if (!(await canManageCompanyMemberships(actor, company))) throw new Error("Forbidden");

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
  invalidateAccessUserCache(userId);
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/companies/${companyId}`);
}

export async function updateCompanyMembershipDepartmentAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const userId = requireString(formData, "userId");
  const companyId = requireString(formData, "companyId");
  const departmentIdRaw = String(formData.get("departmentId") ?? "").trim();

  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!(await canManageCompanyMemberships(actor, company))) throw new Error("Forbidden");

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
  invalidateAccessUserCache(userId);
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/staff");
}

export async function updateCompanyMembershipRoleAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const userId = requireString(formData, "userId");
  const companyId = requireString(formData, "companyId");
  const roleDefinitionId = requireString(formData, "roleDefinitionId");

  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!(await canManageCompanyMemberships(actor, company))) throw new Error("Forbidden");

  const [membership, role] = await Promise.all([
    prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
      include: { roleDefinition: true },
    }),
    prisma.roleDefinition.findFirst({
      where: { id: roleDefinitionId, appliesScope: "COMPANY" },
    }),
  ]);
  if (!membership) throw new Error("User is not a member of this company");
  if (!role) throw new Error("Invalid company role");

  if (membership.roleDefinitionId !== role.id) {
    await writeAudit({
      actorId: actor.id,
      entityType: "USER",
      entityId: userId,
      action: "COMPANY_ROLE_UPDATE",
      meta: JSON.stringify({
        companyId,
        oldRoleKey: membership.roleDefinition.key,
        newRoleKey: role.key,
      }),
    });
  }

  await prisma.companyMembership.update({
    where: { id: membership.id },
    data: { roleDefinitionId: role.id },
  });
  invalidateAccessUserCache(userId);
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/staff");
}

export async function assignProjectAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const userId = requireString(formData, "userId");
  const projectId = requireString(formData, "projectId");
  const roleDefinitionId = requireString(formData, "roleDefinitionId");

  const [project, role] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { company: true },
    }),
    prisma.roleDefinition.findFirst({ where: { id: roleDefinitionId, appliesScope: "PROJECT" } }),
  ]);
  if (!project) throw new Error("Project not found");
  if (!role) throw new Error("Invalid project role");
  if (!(await canManageProjectMemberships(actor, project))) throw new Error("Forbidden");

  await prisma.projectMembership.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId, roleDefinitionId: role.id },
    update: { roleDefinitionId: role.id },
  });
  invalidateAccessUserCache(userId);
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateProjectMembershipRoleAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const userId = requireString(formData, "userId");
  const projectId = requireString(formData, "projectId");
  const roleDefinitionId = requireString(formData, "roleDefinitionId");

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Project not found");
  if (!(await canManageProjectMemberships(actor, project))) throw new Error("Forbidden");

  const [membership, role] = await Promise.all([
    prisma.projectMembership.findUnique({
      where: { userId_projectId: { userId, projectId } },
      include: { roleDefinition: true },
    }),
    prisma.roleDefinition.findFirst({
      where: { id: roleDefinitionId, appliesScope: "PROJECT" },
    }),
  ]);
  if (!membership) throw new Error("User is not a member of this project");
  if (!role) throw new Error("Invalid project role");

  if (membership.roleDefinitionId !== role.id) {
    await writeAudit({
      actorId: actor.id,
      entityType: "USER",
      entityId: userId,
      action: "PROJECT_ROLE_UPDATE",
      meta: JSON.stringify({
        projectId,
        oldRoleKey: membership.roleDefinition.key,
        newRoleKey: role.key,
      }),
    });
  }

  await prisma.projectMembership.update({
    where: { id: membership.id },
    data: { roleDefinitionId: role.id },
  });
  invalidateAccessUserCache(userId);
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function removeCompanyMembershipAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const userId = requireString(formData, "userId");
  const companyId = requireString(formData, "companyId");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!(await canManageCompanyMemberships(actor, company))) throw new Error("Forbidden");
  await prisma.companyMembership.deleteMany({ where: { userId, companyId } });
  invalidateAccessUserCache(userId);
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/companies/${companyId}`);
}

export async function removeProjectMembershipAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const userId = requireString(formData, "userId");
  const projectId = requireString(formData, "projectId");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Project not found");
  if (!(await canManageProjectMemberships(actor, project))) throw new Error("Forbidden");
  await prisma.projectMembership.deleteMany({ where: { userId, projectId } });
  invalidateAccessUserCache(userId);
  invalidatePermissionCache(userId);
  revalidatePath(`/staff/${userId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function assignMultipleToProjectAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const projectId = requireString(formData, "projectId");
  const roleDefinitionId = requireString(formData, "roleDefinitionId");
  const memberIds = formData.getAll("memberIds").map((v) => String(v).trim()).filter(Boolean);
  if (!memberIds.length) throw new Error("Select at least one member");

  const [project, role] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { company: true },
    }),
    prisma.roleDefinition.findFirst({ where: { id: roleDefinitionId, appliesScope: "PROJECT" } }),
  ]);
  if (!project) throw new Error("Project not found");
  if (!role) throw new Error("Invalid project role");
  if (!(await canManageProjectMemberships(actor, project))) throw new Error("Forbidden");

  const valid = await prisma.user.findMany({
    where: { id: { in: memberIds }, deletedAt: null, active: true },
    select: { id: true },
  });
  for (const { id } of valid) {
    await prisma.projectMembership.upsert({
      where: { userId_projectId: { userId: id, projectId } },
      create: { userId: id, projectId, roleDefinitionId: role.id },
      update: { roleDefinitionId: role.id },
    });
    invalidateAccessUserCache(id);
    invalidatePermissionCache(id);
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/staff");
}
