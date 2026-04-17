import type { PermissionKey } from "./permission-keys";
import { PERMISSION_KEYS } from "./permission-keys";

export type RoleScope = "GROUP" | "COMPANY" | "PROJECT";

export type RoleCatalogEntry = {
  key: string;
  displayName: string;
  description: string;
  appliesScope: RoleScope;
  system: true;
};

export const ALL_PERMISSION_KEYS_LIST: PermissionKey[] = [...PERMISSION_KEYS];

export const COMPANY_ADMIN_DEFAULT_PERMISSIONS: PermissionKey[] = ALL_PERMISSION_KEYS_LIST.filter(
  (key) =>
    ![
      "org.group.update",
      "permission.matrix.update",
      "trash.purge",
      "staff.purge",
      "staff.soft_delete",
      "staff.restore",
      "company.purge",
      "project.purge",
    ].includes(key),
);

export const PROJECT_MANAGER_DEFAULT_PERMISSIONS: PermissionKey[] = [
  "org.group.read",
  "company.read",
  "project.create",
  "project.read",
  "project.update",
  "project.archive",
  "project.restore",
  "project.workflow.read",
  "project.workflow.update",
  "project.map.update",
  "project.member.manage",
  "recognition.read",
  "recognition.create",
  "feedback.submit",
  "leaderboard.read",
  "knowledge.read",
  "knowledge.create",
  "staff.read",
  "staff.assign_project",
  "trash.read",
  "trash.restore",
  "lifecycle.onboarding.hub",
];

export const COMPANY_CONTRIBUTOR_DEFAULT_PERMISSIONS: PermissionKey[] = [
  "org.group.read",
  "company.read",
  "project.create",
  "project.read",
  "project.update",
  "project.archive",
  "project.restore",
  "project.workflow.read",
  "project.workflow.update",
  "project.map.update",
  "project.member.manage",
  "recognition.read",
  "recognition.create",
  "leaderboard.read",
  "knowledge.read",
  "knowledge.create",
  "staff.read",
  "lifecycle.onboarding.hub",
];

export const PROJECT_CONTRIBUTOR_DEFAULT_PERMISSIONS: PermissionKey[] = [
  "org.group.read",
  "company.read",
  "project.create",
  "project.read",
  "project.update",
  "project.archive",
  "project.restore",
  "project.workflow.read",
  "project.workflow.update",
  "project.map.update",
  "project.member.manage",
  "recognition.read",
  "recognition.create",
  "leaderboard.read",
  "knowledge.read",
  "knowledge.create",
  "staff.read",
  "lifecycle.onboarding.hub",
];

export const HR_DEFAULT_PERMISSIONS: PermissionKey[] = [
  "org.group.read",
  "company.read",
  "staff.create",
  "staff.read",
  "staff.update",
  "staff.assign_company",
  "staff.soft_delete",
  "staff.restore",
  "staff.birthday.read",
  "trash.read",
  "trash.restore",
  "lifecycle.onboarding.hub",
  "lifecycle.hr.pipeline",
];

export const SYSTEM_ROLE_DEFINITIONS: RoleCatalogEntry[] = [
  {
    key: "GROUP_ADMIN",
    displayName: "Group Admin",
    description: "Manage the parent group, companies, and group-level staff visibility.",
    appliesScope: "GROUP",
    system: true,
  },
  {
    key: "COMPANY_ADMIN",
    displayName: "Company Admin",
    description: "Full management for one company entity and its projects.",
    appliesScope: "COMPANY",
    system: true,
  },
  {
    key: "HR",
    displayName: "HR",
    description: "Manage staff records, onboarding visibility, and birthdays without company administration powers.",
    appliesScope: "COMPANY",
    system: true,
  },
  {
    key: "PROJECT_MANAGER",
    displayName: "Project Manager",
    description: "Own delivery for a project: members, workflow, and reporting.",
    appliesScope: "PROJECT",
    system: true,
  },
  {
    key: "COMPANY_CONTRIBUTOR",
    displayName: "Company Contributor",
    description: "Works under a company entity; may be assigned to multiple projects.",
    appliesScope: "COMPANY",
    system: true,
  },
  {
    key: "PROJECT_CONTRIBUTOR",
    displayName: "Project Contributor",
    description: "Executes work on assigned projects and workflow nodes.",
    appliesScope: "PROJECT",
    system: true,
  },
];

export const SYSTEM_ROLE_PERMISSION_KEYS: Record<string, PermissionKey[]> = {
  GROUP_ADMIN: ALL_PERMISSION_KEYS_LIST,
  COMPANY_ADMIN: COMPANY_ADMIN_DEFAULT_PERMISSIONS,
  HR: HR_DEFAULT_PERMISSIONS,
  PROJECT_MANAGER: PROJECT_MANAGER_DEFAULT_PERMISSIONS,
  COMPANY_CONTRIBUTOR: COMPANY_CONTRIBUTOR_DEFAULT_PERMISSIONS,
  PROJECT_CONTRIBUTOR: PROJECT_CONTRIBUTOR_DEFAULT_PERMISSIONS,
};
