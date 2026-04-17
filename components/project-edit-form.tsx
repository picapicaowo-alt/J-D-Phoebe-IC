"use client";

import { useEffect, useId, useState } from "react";
import { Priority, ProjectStatus } from "@prisma/client";
import { updateProjectAction } from "@/app/actions/project";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Locale } from "@/lib/locale";
import { tPriority, tProjectStatus } from "@/lib/messages";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "AT_RISK",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
  "CANCELLED",
];

type CompanyOption = {
  id: string;
  name: string;
};

type DepartmentOption = {
  id: string;
  name: string;
  companyId: string;
};

type ProjectGroupOption = {
  id: string;
  name: string;
  companyId: string;
};

type StaffOption = {
  id: string;
  name: string;
  companyIds: string[];
};

type Labels = {
  company: string;
  department: string;
  projectGroup: string;
  none: string;
  owner: string;
  noStaff: string;
  name: string;
  description: string;
  deadline: string;
  priority: string;
  status: string;
  submit: string;
};

type Props = {
  locale: Locale;
  project: {
    id: string;
    companyId: string;
    name: string;
    description: string | null;
    ownerId: string;
    departmentId: string | null;
    projectGroupId: string | null;
    priority: Priority;
    status: ProjectStatus;
    deadlineValue: string;
  };
  companies: CompanyOption[];
  departments: DepartmentOption[];
  projectGroups: ProjectGroupOption[];
  staff: StaffOption[];
  labels: Labels;
};

export function ProjectEditForm({ locale, project, companies, departments, projectGroups, staff, labels }: Props) {
  const idPrefix = useId();
  const [companyId, setCompanyId] = useState(project.companyId);
  const [departmentId, setDepartmentId] = useState(project.departmentId ?? "");
  const [projectGroupId, setProjectGroupId] = useState(project.projectGroupId ?? "");
  const [ownerId, setOwnerId] = useState(project.ownerId);

  const visibleDepartments = departments.filter((department) => department.companyId === companyId);
  const visibleProjectGroups = projectGroups.filter((group) => group.companyId === companyId);
  const visibleStaff = staff.filter((member) => member.companyIds.includes(companyId));

  useEffect(() => {
    if (departmentId && !visibleDepartments.some((department) => department.id === departmentId)) {
      setDepartmentId("");
    }
  }, [departmentId, visibleDepartments]);

  useEffect(() => {
    if (projectGroupId && !visibleProjectGroups.some((group) => group.id === projectGroupId)) {
      setProjectGroupId("");
    }
  }, [projectGroupId, visibleProjectGroups]);

  useEffect(() => {
    if (ownerId && visibleStaff.some((member) => member.id === ownerId)) return;
    setOwnerId(visibleStaff[0]?.id ?? "");
  }, [ownerId, visibleStaff]);

  return (
    <form action={updateProjectAction} className="space-y-3">
      <input type="hidden" name="projectId" value={project.id} />

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-company`} className="text-sm font-medium">
          {labels.company}
        </label>
        <Select id={`${idPrefix}-company`} name="companyId" value={companyId} onChange={(event) => setCompanyId(event.target.value)} required>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
          {labels.name}
        </label>
        <Input id={`${idPrefix}-name`} name="name" defaultValue={project.name} required />
      </div>

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-description`} className="text-sm font-medium">
          {labels.description}
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={3}
          defaultValue={project.description ?? ""}
          className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-owner`} className="text-sm font-medium">
          {labels.owner}
        </label>
        <Select id={`${idPrefix}-owner`} name="ownerId" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
          {!visibleStaff.length ? <option value="">{labels.noStaff}</option> : null}
          {visibleStaff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1 md:col-span-2">
          <label htmlFor={`${idPrefix}-department`} className="text-sm font-medium">
            {labels.department}
          </label>
          <Select
            id={`${idPrefix}-department`}
            name="departmentId"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">{labels.none}</option>
            {visibleDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <label htmlFor={`${idPrefix}-project-group`} className="text-sm font-medium">
            {labels.projectGroup}
          </label>
          <Select
            id={`${idPrefix}-project-group`}
            name="projectGroupId"
            value={projectGroupId}
            onChange={(event) => setProjectGroupId(event.target.value)}
          >
            <option value="">{labels.none}</option>
            {visibleProjectGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-priority`} className="text-sm font-medium">
            {labels.priority}
          </label>
          <Select id={`${idPrefix}-priority`} name="priority" defaultValue={project.priority}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {tPriority(locale, priority)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-status`} className="text-sm font-medium">
            {labels.status}
          </label>
          <Select id={`${idPrefix}-status`} name="status" defaultValue={project.status}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {tProjectStatus(locale, status)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-deadline`} className="text-sm font-medium">
          {labels.deadline}
        </label>
        <Input id={`${idPrefix}-deadline`} name="deadline" type="datetime-local" defaultValue={project.deadlineValue} />
      </div>

      <FormSubmitButton type="submit">{labels.submit}</FormSubmitButton>
    </form>
  );
}
