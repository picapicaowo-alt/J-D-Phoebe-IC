"use client";

import { useEffect, useId, useState } from "react";
import { Priority, ProjectStatus } from "@prisma/client";
import { createProjectAction } from "@/app/actions/project";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Locale } from "@/lib/locale";
import { tPriority, tProjectStatus } from "@/lib/messages";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: ProjectStatus[] = ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"];

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
  email: string;
};

type Labels = {
  company: string;
  department: string;
  projectGroup: string;
  none: string;
  projectName: string;
  description: string;
  ownerResponsible: string;
  initialMembersHelp: string;
  ownerBecomesPmHint: string;
  deadline: string;
  priority: string;
  status: string;
  submit: string;
};

type Props = {
  locale: Locale;
  defaultCompanyId: string;
  companies: CompanyOption[];
  departments: DepartmentOption[];
  projectGroups: ProjectGroupOption[];
  staff: StaffOption[];
  labels: Labels;
};

export function ProjectCreateForm({
  locale,
  defaultCompanyId,
  companies,
  departments,
  projectGroups,
  staff,
  labels,
}: Props) {
  const idPrefix = useId();
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [departmentId, setDepartmentId] = useState("");
  const [projectGroupId, setProjectGroupId] = useState("");

  useEffect(() => {
    if (departmentId && !departments.some((department) => department.id === departmentId && department.companyId === companyId)) {
      setDepartmentId("");
    }
    if (projectGroupId && !projectGroups.some((group) => group.id === projectGroupId && group.companyId === companyId)) {
      setProjectGroupId("");
    }
  }, [companyId, departmentId, departments, projectGroupId, projectGroups]);

  const visibleDepartments = departments.filter((department) => department.companyId === companyId);
  const visibleProjectGroups = projectGroups.filter((group) => group.companyId === companyId);

  return (
    <form action={createProjectAction} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-company`} className="text-xs font-medium">
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
        <label htmlFor={`${idPrefix}-department`} className="text-xs font-medium">
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

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-project-group`} className="text-xs font-medium">
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
        <label htmlFor={`${idPrefix}-name`} className="text-xs font-medium">
          {labels.projectName}
        </label>
        <Input id={`${idPrefix}-name`} name="name" required />
      </div>

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-description`} className="text-xs font-medium">
          {labels.description}
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={3}
          className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-owner`} className="text-xs font-medium">
          {labels.ownerResponsible}
        </label>
        <Select id={`${idPrefix}-owner`} name="ownerId" required>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium">{labels.initialMembersHelp}</label>
        <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-[hsl(var(--border))] p-2">
          {staff.map((member) => (
            <label key={member.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="memberIds" value={member.id} />
              <span>{member.name}</span>
              <span className="text-xs text-[hsl(var(--muted))]">{member.email}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-[hsl(var(--muted))]">{labels.ownerBecomesPmHint}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-deadline`} className="text-xs font-medium">
          {labels.deadline}
        </label>
        <Input id={`${idPrefix}-deadline`} name="deadline" type="datetime-local" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-priority`} className="text-xs font-medium">
            {labels.priority}
          </label>
          <Select id={`${idPrefix}-priority`} name="priority" defaultValue="MEDIUM">
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {tPriority(locale, priority)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-status`} className="text-xs font-medium">
            {labels.status}
          </label>
          <Select id={`${idPrefix}-status`} name="status" defaultValue="PLANNING">
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {tProjectStatus(locale, status)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <FormSubmitButton type="submit">{labels.submit}</FormSubmitButton>
    </form>
  );
}
