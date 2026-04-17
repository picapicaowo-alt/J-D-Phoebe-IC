import type { Prisma, User } from "@prisma/client";

export type AccessUser = User & {
  groupMemberships: { orgGroupId: string; roleDefinitionId?: string; roleDefinition: { key: string } }[];
  companyMemberships: {
    companyId: string;
    roleDefinitionId?: string;
    roleDefinition: { key: string };
    company: { orgGroupId: string };
  }[];
  projectMemberships: {
    projectId: string;
    roleDefinitionId?: string;
    roleDefinition: { key: string };
    project: { id: string; companyId: string; company: { orgGroupId: string } };
  }[];
};

export function isSuperAdmin(user: User) {
  return user.isSuperAdmin;
}

export function isGroupAdmin(user: AccessUser, orgGroupId: string) {
  if (user.isSuperAdmin) return true;
  return user.groupMemberships.some((m) => m.orgGroupId === orgGroupId && m.roleDefinition.key === "GROUP_ADMIN");
}

export function isAnyAdmin(user: AccessUser) {
  if (user.isSuperAdmin) return true;
  if (user.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN")) return true;
  return user.companyMemberships.some((m) => m.roleDefinition.key === "COMPANY_ADMIN");
}

export function isCompanyAdmin(user: AccessUser, companyId: string) {
  if (user.isSuperAdmin) return true;
  if (user.companyMemberships.some((m) => m.companyId === companyId && m.roleDefinition.key === "COMPANY_ADMIN")) {
    return true;
  }
  const row = user.companyMemberships.find((m) => m.companyId === companyId);
  if (row && isGroupAdmin(user, row.company.orgGroupId)) return true;
  return false;
}

export function hasCompanyMembership(user: AccessUser, companyId: string) {
  return user.companyMemberships.some((m) => m.companyId === companyId);
}

export function hasProjectMembership(user: AccessUser, projectId: string) {
  return user.projectMemberships.some((m) => m.projectId === projectId);
}

export function hasProjectMembershipInCompany(user: AccessUser, companyId: string) {
  return user.projectMemberships.some((m) => m.project.companyId === companyId);
}

export function canViewProject(
  user: AccessUser,
  project: { id: string; companyId: string; company: { orgGroupId: string }; deletedAt?: Date | null },
) {
  if (project.deletedAt) return false;
  if (user.isSuperAdmin) return true;
  if (hasProjectMembership(user, project.id)) return true;
  if (hasCompanyMembership(user, project.companyId)) return true;
  if (isCompanyAdmin(user, project.companyId)) return true;
  return isGroupAdmin(user, project.company.orgGroupId);
}

/** Create or manage projects at company scope (no project id yet). */
export function canManageCompanyProjects(user: AccessUser, company: { id: string; orgGroupId: string }) {
  if (user.isSuperAdmin) return true;
  if (hasCompanyMembership(user, company.id)) return true;
  if (hasProjectMembershipInCompany(user, company.id)) return true;
  if (isCompanyAdmin(user, company.id)) return true;
  return isGroupAdmin(user, company.orgGroupId);
}

export function canManageProject(
  user: AccessUser,
  project: { id: string; companyId: string; company: { orgGroupId: string } },
) {
  if (user.isSuperAdmin) return true;
  if (hasCompanyMembership(user, project.companyId)) return true;
  if (hasProjectMembership(user, project.id)) return true;
  if (isCompanyAdmin(user, project.companyId)) return true;
  if (isGroupAdmin(user, project.company.orgGroupId)) return true;
  return false;
}

/** Drag/edit workflow graph (positions, edges) — not the same as org-wide project settings. */
export function canEditWorkflow(
  user: AccessUser,
  project: { id: string; companyId: string; company: { orgGroupId: string } },
) {
  if (canManageProject(user, project)) return true;
  return user.projectMemberships.some(
    (m) => m.projectId === project.id && m.roleDefinition.key === "PROJECT_MANAGER",
  );
}

/** Lightweight project map edits (same gate as workflow for Phase 1; also keyed by `project.map.update` in actions). */
export function canEditProjectMap(
  user: AccessUser,
  project: { id: string; companyId: string; company: { orgGroupId: string } },
) {
  return canEditWorkflow(user, project);
}

export function canManageKnowledgeAsset(user: User, knowledge: { authorId: string }) {
  return user.isSuperAdmin || user.id === knowledge.authorId;
}

export function projectVisibilityWhere(user: AccessUser): Prisma.ProjectWhereInput {
  if (user.isSuperAdmin) return {};

  const groupOrgIds = user.groupMemberships.map((m) => m.orgGroupId);
  const companyIds = user.companyMemberships.map((m) => m.companyId);
  const projectIds = user.projectMemberships.map((m) => m.projectId);

  const OR: Prisma.ProjectWhereInput[] = [];
  if (groupOrgIds.length) OR.push({ company: { orgGroupId: { in: [...new Set(groupOrgIds)] } } });
  if (companyIds.length) OR.push({ companyId: { in: [...new Set(companyIds)] } });
  if (projectIds.length) OR.push({ id: { in: [...new Set(projectIds)] } });

  return OR.length ? { OR } : { id: { in: [] } };
}

export function companyVisibilityWhere(user: AccessUser): Prisma.CompanyWhereInput {
  if (user.isSuperAdmin) return {};

  const groupOrgIds = user.groupMemberships.map((m) => m.orgGroupId);
  const companyIdsFromMemberships = user.companyMemberships.map((m) => m.companyId);
  const projectCompanyIds = user.projectMemberships.map((m) => m.project.companyId);

  const OR: Prisma.CompanyWhereInput[] = [];
  if (groupOrgIds.length) OR.push({ orgGroupId: { in: [...new Set(groupOrgIds)] } });
  const companyIds = [...new Set([...companyIdsFromMemberships, ...projectCompanyIds])];
  if (companyIds.length) OR.push({ id: { in: companyIds } });

  return OR.length ? { OR } : { id: { in: [] } };
}
