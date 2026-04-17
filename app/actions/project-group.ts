"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canManageCompanyProjects, canManageProjectSettings, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function req(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

export async function createProjectGroupAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.update");
  const companyId = req(formData, "companyId");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!canManageCompanyProjects(user, { id: company.id, orgGroupId: company.orgGroupId })) {
    throw new Error("Forbidden");
  }
  const name = req(formData, "name");
  const maxSort = await prisma.projectGroup.aggregate({
    where: { companyId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
  await prisma.projectGroup.create({ data: { companyId, name, sortOrder } });
  revalidatePath("/projects");
  revalidatePath(`/companies/${companyId}`);
}

export async function updateProjectGroupAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.update");
  const id = req(formData, "projectGroupId");
  const name = req(formData, "name");
  const g = await prisma.projectGroup.findFirst({ where: { id }, include: { company: true } });
  if (!g) throw new Error("Group not found");
  if (!canManageCompanyProjects(user, { id: g.companyId, orgGroupId: g.company.orgGroupId })) {
    throw new Error("Forbidden");
  }
  await prisma.projectGroup.update({ where: { id }, data: { name } });
  revalidatePath("/projects");
  revalidatePath(`/companies/${g.companyId}`);
}

/** Removes the group and clears projectGroupId on all projects in that group. */
export async function deleteProjectGroupAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  await assertPermission(user, "project.update");
  const id = req(formData, "projectGroupId");
  const g = await prisma.projectGroup.findFirst({ where: { id }, include: { company: true } });
  if (!g) throw new Error("Group not found");
  if (!canManageCompanyProjects(user, { id: g.companyId, orgGroupId: g.company.orgGroupId })) {
    throw new Error("Forbidden");
  }
  await prisma.project.updateMany({
    where: { projectGroupId: id, deletedAt: null },
    data: { projectGroupId: null, groupSortOrder: 0 },
  });
  await prisma.projectGroup.delete({ where: { id } });
  revalidatePath("/projects");
  revalidatePath(`/companies/${g.companyId}`);
}

export async function setProjectGroupMembershipAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const projectId = req(formData, "projectId");
  const projectGroupIdRaw = String(formData.get("projectGroupId") ?? "").trim();
  const projectGroupId = projectGroupIdRaw || null;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project) throw new Error("Project not found");
  if (!canManageProjectSettings(user, project)) {
    throw new Error("Forbidden");
  }

  if (projectGroupId) {
    const g = await prisma.projectGroup.findFirst({
      where: { id: projectGroupId, companyId: project.companyId },
    });
    if (!g) throw new Error("Group does not belong to this company");
  }

  const maxInBucket = await prisma.project.aggregate({
    where: {
      companyId: project.companyId,
      deletedAt: null,
      projectGroupId: projectGroupId ? projectGroupId : null,
      NOT: { id: projectId },
    },
    _max: { groupSortOrder: true },
  });
  const groupSortOrder = (maxInBucket._max.groupSortOrder ?? -1) + 1;

  await prisma.project.update({
    where: { id: projectId },
    data: { projectGroupId, groupSortOrder },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/companies/${project.companyId}`);
  revalidatePath(`/projects?companyId=${project.companyId}`);
}
