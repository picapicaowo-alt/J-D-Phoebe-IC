"use client";

import { useEffect, useId, useState } from "react";
import { assignCompanyAction } from "@/app/actions/staff";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Select } from "@/components/ui/select";

type CompanyOption = {
  id: string;
  name: string;
};

type DepartmentOption = {
  id: string;
  name: string;
  companyId: string;
};

type RoleOption = {
  id: string;
  displayName: string;
};

type SupervisorOption = {
  id: string;
  name: string;
};

type Labels = {
  company: string;
  department: string;
  permission: string;
  supervisor: string;
  selectCompany: string;
  noDepartment: string;
  noSupervisor: string;
  submit: string;
};

type Props = {
  userId: string;
  companies: CompanyOption[];
  departments: DepartmentOption[];
  companyRoles: RoleOption[];
  supervisorCandidates: SupervisorOption[];
  defaultCompanyRoleId: string;
  labels: Labels;
};

export function StaffAssignCompanyForm({
  userId,
  companies,
  departments,
  companyRoles,
  supervisorCandidates,
  defaultCompanyRoleId,
  labels,
}: Props) {
  const idPrefix = useId();
  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  useEffect(() => {
    if (!departmentId) return;
    const stillValid = departments.some((department) => department.id === departmentId && department.companyId === companyId);
    if (!stillValid) setDepartmentId("");
  }, [companyId, departmentId, departments]);

  const visibleDepartments = companyId ? departments.filter((department) => department.companyId === companyId) : [];

  return (
    <form action={assignCompanyAction} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />

      <div className="grid gap-1 md:grid-cols-[180px_minmax(0,1fr)] md:items-center md:gap-3">
        <label htmlFor={`${idPrefix}-company`} className="text-sm font-medium">
          {labels.company}
        </label>
        <Select
          id={`${idPrefix}-company`}
          name="companyId"
          required
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
          className="min-w-0"
        >
          <option value="">{labels.selectCompany}</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-1 md:grid-cols-[180px_minmax(0,1fr)] md:items-center md:gap-3">
        <label htmlFor={`${idPrefix}-department`} className="text-sm font-medium">
          {labels.department}
        </label>
        <Select
          id={`${idPrefix}-department`}
          name="departmentId"
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
          disabled={!companyId}
          className="min-w-0"
        >
          <option value="">{labels.noDepartment}</option>
          {visibleDepartments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-1 md:grid-cols-[180px_minmax(0,1fr)] md:items-center md:gap-3">
        <label htmlFor={`${idPrefix}-permission`} className="text-sm font-medium">
          {labels.permission}
        </label>
        <Select id={`${idPrefix}-permission`} name="roleDefinitionId" required defaultValue={defaultCompanyRoleId} className="min-w-0">
          {companyRoles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.displayName}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-1 md:grid-cols-[180px_minmax(0,1fr)] md:items-center md:gap-3">
        <label htmlFor={`${idPrefix}-supervisor`} className="text-sm font-medium">
          {labels.supervisor}
        </label>
        <Select id={`${idPrefix}-supervisor`} name="supervisorUserId" className="min-w-0">
          <option value="">{labels.noSupervisor}</option>
          {supervisorCandidates.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-1 md:grid-cols-[180px_minmax(0,1fr)] md:items-center md:gap-3">
        <div className="hidden md:block" />
        <div>
          <FormSubmitButton type="submit">{labels.submit}</FormSubmitButton>
        </div>
      </div>
    </form>
  );
}
