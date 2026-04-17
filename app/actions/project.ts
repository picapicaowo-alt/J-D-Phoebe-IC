"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Priority, ProjectRelationType, ProjectStatus } from "@prisma/client";
import { invalidateAccessUserCache, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { canManageProject, type AccessUser } from "@/lib/access";
import { assertPermission, invalidatePermissionCache } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canCreateProjectInCompany } from "@/lib/scoped-role-access";
import { parseDatetimeLocalInTimeZone } from "@/lib/timezone";

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

export async function createProjectAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.create");
  const companyId = requireString(formData, "companyId");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!(await canCreateProjectInCompany(user, { id: company.id, orgGroupId: company.orgGroupId }))) {
    throw new Error("Forbidden");
  }

  const name = requireString(formData, "name");
  const description = String(formData.get("description") ?? "").trim() || null;
  const ownerId = requireString(formData, "ownerId");
  const priority = requireString(formData, "priority") as Priority;
  const status = (String(formData.get("status") ?? "PLANNING") || "PLANNING") as ProjectStatus;
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  const deadline = deadlineRaw ? parseDatetimeLocalInTimeZone(deadlineRaw, user.timezone) : null;
  const requestedMemberIds = getStringArray(formData, "memberIds");
  const memberIds = [...new Set([user.id, ownerId, ...requestedMemberIds])];

  const departmentIdRaw = String(formData.get("departmentId") ?? "").trim();
  const departmentId: string | null = departmentIdRaw
    ? await (async () => {
        const d = await prisma.department.findFirst({ where: { id: departmentIdRaw, companyId } });
        if (!d) throw new Error("Invalid department for this company");
        return d.id;
      })()
    : null;
  const projectGroupIdRaw = String(formData.get("projectGroupId") ?? "").trim();
  const projectGroupId: string | null = projectGroupIdRaw
    ? await (async () => {
        const g = await prisma.projectGroup.findFirst({ where: { id: projectGroupIdRaw, companyId } });
        if (!g) throw new Error("Invalid project group for this company");
        return g.id;
      })()
    : null;

  const p = await prisma.project.create({
    data: {
      companyId,
      name,
      description,
      ownerId,
      priority,
      status,
      deadline,
      departmentId,
      projectGroupId,
    },
  });

  await prisma.workflowLayer.create({
    data: { projectId: p.id, name: "Default layer", sortOrder: 0 },
  });

  const [pmRole, contributorRole] = await Promise.all([
    prisma.roleDefinition.findUnique({ where: { key: "PROJECT_MANAGER" } }),
    prisma.roleDefinition.findUnique({ where: { key: "PROJECT_CONTRIBUTOR" } }),
  ]);
  if (!pmRole || !contributorRole) {
    throw new Error("Project role definitions are missing. Run database seed.");
  }

  const activeMembers = await prisma.user.findMany({
    where: { id: { in: memberIds }, deletedAt: null, active: true },
    select: { id: true },
  });
  const validMemberIds = activeMembers.map((u) => u.id);

  if (validMemberIds.length) {
    await prisma.projectMembership.createMany({
      data: validMemberIds.map((userId) => ({
        userId,
        projectId: p.id,
        roleDefinitionId: userId === ownerId ? pmRole.id : contributorRole.id,
      })),
      skipDuplicates: true,
    });
  }

  for (const touchedUserId of new Set([user.id, ...validMemberIds])) {
    invalidateAccessUserCache(touchedUserId);
    invalidatePermissionCache(touchedUserId);
  }

  await writeAudit({ actorId: user.id, entityType: "PROJECT", entityId: p.id, action: "CREATE", newValue: name });
  revalidatePath("/projects");
  revalidatePath("/calendar");
  revalidatePath(`/projects/${p.id}`);
  revalidatePath(`/companies/${companyId}`);
  redirect(`/projects/${p.id}`);
}

export async function updateProjectAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.update");
  const projectId = requireString(formData, "projectId");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Not found");
  if (!canManageProject(user, project)) throw new Error("Forbidden");

  const name = requireString(formData, "name");
  const description = String(formData.get("description") ?? "").trim() || null;
  const ownerId = requireString(formData, "ownerId");
  const priority = requireString(formData, "priority") as Priority;
  const status = requireString(formData, "status") as ProjectStatus;
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  const deadlineNorm = deadlineRaw ? parseDatetimeLocalInTimeZone(deadlineRaw, user.timezone) : null;

  const departmentIdRaw = String(formData.get("departmentId") ?? "").trim();
  const departmentId: string | null = departmentIdRaw
    ? await (async () => {
        const d = await prisma.department.findFirst({ where: { id: departmentIdRaw, companyId: project.companyId } });
        if (!d) throw new Error("Invalid department for this company");
        return d.id;
      })()
    : null;
  const projectGroupIdRaw = String(formData.get("projectGroupId") ?? "").trim();
  const projectGroupId: string | null = projectGroupIdRaw
    ? await (async () => {
        const g = await prisma.projectGroup.findFirst({
          where: { id: projectGroupIdRaw, companyId: project.companyId },
        });
        if (!g) throw new Error("Invalid project group for this company");
        return g.id;
      })()
    : null;

  if (name !== project.name) {
    await writeAudit({
      actorId: user.id,
      entityType: "PROJECT",
      entityId: projectId,
      action: "RENAME",
      field: "name",
      oldValue: project.name,
      newValue: name,
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name,
      description,
      ownerId,
      priority,
      status,
      deadline: deadlineNorm,
      departmentId,
      projectGroupId,
    },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/calendar");
  revalidatePath(`/companies/${project.companyId}`);
}

export async function archiveProjectAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.archive");
  const projectId = requireString(formData, "projectId");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Not found");
  if (!canManageProject(user, project)) throw new Error("Forbidden");

  await prisma.project.update({
    where: { id: projectId },
    data: { status: ProjectStatus.ARCHIVED, archivedAt: new Date() },
  });
  await writeAudit({ actorId: user.id, entityType: "PROJECT", entityId: projectId, action: "ARCHIVE" });
  revalidatePath("/projects");
  revalidatePath("/calendar");
}

export async function restoreProjectAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.restore");
  const projectId = requireString(formData, "projectId");
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Not found");
  if (!canManageProject(user, project)) throw new Error("Forbidden");

  await prisma.project.update({
    where: { id: projectId },
    data: { status: ProjectStatus.ACTIVE, archivedAt: null },
  });
  await writeAudit({ actorId: user.id, entityType: "PROJECT", entityId: projectId, action: "RESTORE" });
  revalidatePath("/projects");
  revalidatePath("/calendar");
}

export async function addProjectRelationAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.update");
  const fromProjectId = requireString(formData, "fromProjectId");
  const toProjectId = requireString(formData, "toProjectId");
  const relationType = requireString(formData, "relationType") as ProjectRelationType;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (fromProjectId === toProjectId) {
    throw new Error("Project relation requires two different projects.");
  }

  const [fromProject, toProject] = await Promise.all([
    prisma.project.findFirst({ where: { id: fromProjectId, deletedAt: null }, include: { company: true } }),
    prisma.project.findFirst({ where: { id: toProjectId, deletedAt: null }, include: { company: true } }),
  ]);
  if (!fromProject || !toProject) throw new Error("Project not found");
  if (!canManageProject(user, fromProject)) throw new Error("Forbidden");

  await prisma.projectRelation.upsert({
    where: {
      fromProjectId_toProjectId_relationType: { fromProjectId, toProjectId, relationType },
    },
    create: { fromProjectId, toProjectId, relationType, note },
    update: { note },
  });

  await writeAudit({
    actorId: user.id,
    entityType: "PROJECT_RELATION",
    entityId: `${fromProjectId}:${toProjectId}:${relationType}`,
    action: "UPSERT",
    meta: JSON.stringify({ note }),
  });

  revalidatePath(`/projects/${fromProjectId}`);
  revalidatePath(`/projects/${toProjectId}`);
  revalidatePath("/projects");
}

export async function removeProjectRelationAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.update");
  const relationId = requireString(formData, "relationId");
  const relation = await prisma.projectRelation.findUnique({
    where: { id: relationId },
    include: { fromProject: { include: { company: true } }, toProject: { include: { company: true } } },
  });
  if (!relation) throw new Error("Relation not found");
  if (!canManageProject(user, relation.fromProject) && !canManageProject(user, relation.toProject)) {
    throw new Error("Forbidden");
  }

  await prisma.projectRelation.delete({ where: { id: relationId } });
  await writeAudit({
    actorId: user.id,
    entityType: "PROJECT_RELATION",
    entityId: relationId,
    action: "DELETE",
  });

  revalidatePath(`/projects/${relation.fromProjectId}`);
  revalidatePath(`/projects/${relation.toProjectId}`);
  revalidatePath("/projects");
}

export async function updateProjectRelationNoteAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.update");
  const relationId = requireString(formData, "relationId");
  const note = String(formData.get("note") ?? "").trim() || null;
  const relation = await prisma.projectRelation.findUnique({
    where: { id: relationId },
    include: { fromProject: { include: { company: true } }, toProject: { include: { company: true } } },
  });
  if (!relation) throw new Error("Relation not found");
  if (!canManageProject(user, relation.fromProject) && !canManageProject(user, relation.toProject)) {
    throw new Error("Forbidden");
  }

  await prisma.projectRelation.update({
    where: { id: relationId },
    data: { note },
  });
  await writeAudit({
    actorId: user.id,
    entityType: "PROJECT_RELATION",
    entityId: relationId,
    action: "UPDATE_NOTE",
    meta: JSON.stringify({ note }),
  });

  revalidatePath(`/projects/${relation.fromProjectId}`);
  revalidatePath(`/projects/${relation.toProjectId}`);
}
