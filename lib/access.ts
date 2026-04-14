import type { User } from "@prisma/client";

export type AccessUser = User & {
  groupMemberships: { orgGroupId: string; roleDefinition: { key: string } }[];
  companyMemberships: { companyId: string; roleDefinition: { key: string }; company: { orgGroupId: string } }[];
  projectMemberships: {
    projectId: string;
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

export function isCompanyAdmin(user: AccessUser, companyId: string) {
  if (user.isSuperAdmin) return true;
  if (user.companyMemberships.some((m) => m.companyId === companyId && m.roleDefinition.key === "COMPANY_ADMIN")) {
    return true;
  }
  const row = user.companyMemberships.find((m) => m.companyId === companyId);
  if (row && isGroupAdmin(user, row.company.orgGroupId)) return true;
  return false;
}

export function canViewProject(
  user: AccessUser,
  project: { id: string; companyId: string; company: { orgGroupId: string }; deletedAt?: Date | null },
) {
  if (project.deletedAt) return false;
  if (user.isSuperAdmin) return true;
  if (user.projectMemberships.some((m) => m.projectId === project.id)) return true;
  if (isCompanyAdmin(user, project.companyId)) return true;
  return isGroupAdmin(user, project.company.orgGroupId);
}

/** Create or manage projects at company scope (no project id yet). */
export function canManageCompanyProjects(user: AccessUser, company: { id: string; orgGroupId: string }) {
  if (user.isSuperAdmin) return true;
  if (isCompanyAdmin(user, company.id)) return true;
  return isGroupAdmin(user, company.orgGroupId);
}

export function canManageProject(
  user: AccessUser,
  project: { id: string; companyId: string; company: { orgGroupId: string } },
) {
  if (user.isSuperAdmin) return true;
  if (isCompanyAdmin(user, project.companyId)) return true;
  if (isGroupAdmin(user, project.company.orgGroupId)) return true;
  return user.projectMemberships.some(
    (m) => m.projectId === project.id && m.roleDefinition.key === "PROJECT_MANAGER",
  );
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
